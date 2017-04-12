const Encryptor = require('./encryptor');
const logger = require('heimdalljs-logger');
const Session = require('./session');
const bearerTokenPattern = /bearer +(.*)$/i;
const compose = require('koa-compose');
const route = require('koa-better-route');
const koaJSONBody = require('koa-json-body');
const Handlebars = require('handlebars');

class Authentication {
  constructor(key, searcher, plugins) {
    this.encryptor = new Encryptor(key);
    this.log = logger('auth');

    // TODO: these should move into config
    let userContentType = 'users';
    let controllingBranch = 'master';

    this.userSearcher = {
      get(userId) {
        return searcher.get(controllingBranch, userContentType, userId);
      },
      search(params) {
        let { filter } = params;
        if (!filter) {
          filter = {};
        }
        filter.type = userContentType;
        return searcher.search(controllingBranch, Object.assign({}, params, { filter }));
      }
    };

    this.plugins = plugins;
    this.searcher = searcher;
    this.controllingBranch = controllingBranch;
    this.userContentType = userContentType;
  }

  async createToken(sessionPayload, validSeconds) {
    let validUntil = Math.floor(Date.now()/1000 + validSeconds);
    return {
      token: this.encryptor.encryptAndSign([sessionPayload, validUntil]),
      validUntil
    };
  }

  _tokenToSession(token) {
    try {
      let [sessionPayload, validUntil] = this.encryptor.verifyAndDecrypt(token);
      if (validUntil <= Date.now()/1000) {
        this.log.debug("Ignoring expired token");
      } else {
        return new Session(sessionPayload, this.userSearcher);
      }
    } catch (err) {
      if (/unable to authenticate data|invalid key length/.test(err.message)) {
        this.log.warn("Ignoring invalid token");
      } else {
        throw err;
      }
    }
  }

  middleware() {
    const prefix = 'auth';
    return compose([
      this._tokenVerifier(),
      this._tokenIssuerPreflight(prefix),
      this._tokenIssuer(prefix)
    ]);
  }

  _tokenVerifier() {
    return async (ctxt, next) => {
      let m = bearerTokenPattern.exec(ctxt.header['authorization']);
      if (m) {
        let session = this._tokenToSession(m[1]);
        if (session) {
          ctxt.state.cardstackSession = session;
        }
      }
      await next();
    };
  }

  _tokenIssuerPreflight(prefix) {
    return route.options(`/${prefix}/:module`,  async (ctxt) => {
      ctxt.response.set('Access-Control-Allow-Origin', '*');
      ctxt.response.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
      ctxt.response.set('Access-Control-Allow-Headers', 'Content-Type');
      ctxt.status = 200;
    });
  }

  async _locateAuthenticationSource(name) {
    let source = await this.searcher.get(this.controllingBranch, 'authentication-sources', name);
    let plugin = this.plugins.lookup('authenticators', source.attributes['authenticator-type']);
    return { plugin, source };
  }

  async _invokeAuthenticationSource(ctxt, sourceAndPlugin) {
    let { source, plugin } = sourceAndPlugin;
    let params = source.attributes.params;
    let result = await plugin.authenticate(ctxt.request.body, params, this.userSearcher);
    if (!result || !(result.preloadedUser || result.user)) {
      ctxt.status = 401;
      return;
    }

    let user = result.preloadedUser || this._rewriteExternalUser(result.user, source.attributes['user-template']);
    let response = await this.createToken({ userId: user.id }, 86400);
    response.user = result.preloadedUser || await this.userSearcher.get(user.id);
    ctxt.body = response;
    ctxt.status = 200;
  }

  _rewriteExternalUser(externalUser, userTemplate) {
    if (!userTemplate) {
      return externalUser;
    }
    let compiled = Handlebars.compile(userTemplate);
    return JSON.parse(compiled(externalUser));
  }

  _tokenIssuer(prefix){
    return route.post(`/${prefix}/:module`, compose([
      koaJSONBody({ limit: '1mb' }),
      async (ctxt) => {
        ctxt.response.set('Access-Control-Allow-Origin', '*');
        try {
          let sourceAndPlugin = await this._locateAuthenticationSource(ctxt.routeParams.module);
          if (sourceAndPlugin) {
            await this._invokeAuthenticationSource(ctxt, sourceAndPlugin);
          }
        } catch (err) {
          if (!err.isCardstackError) { throw err; }
          let errors = [err];
          if (err.additionalErrors) {
            errors = errors.concat(err.additionalErrors);
          }
          ctxt.body = { errors };
          ctxt.status = errors[0].status;
        }
      }
    ]));
  }
}


module.exports = Authentication;
