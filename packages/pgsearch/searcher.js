const log = require('@cardstack/logger')('cardstack/pgsearch');
const Error = require('@cardstack/plugin-utils/error');
const { declareInjections } = require('@cardstack/di');


module.exports = declareInjections({
  schema: 'hub:current-schema',
  client: `plugin-client:${require.resolve('./client')}`
}, class Searcher {
  constructor() {
    log.debug("constructed pgsearch searcher");
   }

  async get(session, branch, type, id) {
    let response = await this.client.query('select pristine_doc from documents where branch=$1 and type=$2 and id=$3', [branch, type, id]);
    if (response.rowCount > 0){
      return response.rows[0].pristine_doc;
    }
  }

  async search(session, branch, { queryString, filter, sort, page } ) {
    let realms = await session.realms();
    let schema = await this.schema.forBranch(branch);

    let conditions = [
      ['branch = ', { param: branch }],
      ['realms && ', { param: realms }]
    ];

    if (filter) {
      conditions.push(this.filterCondition(branch, schema, filter));
    }

    let query = [`select pristine_doc from documents where`, ...every(conditions)];
    let sql = queryToSQL(query);
    let response = await this.client.query(sql);
    return { data: response.rows.map(row => row.pristine_doc.data)};
  }

  filterCondition(branch, schema, filter){
    return every(Object.entries(filter).map(([key, value]) => this.fieldFilter(branch, schema, key, value)));
  }

  fieldFilter(branch, schema, key, value) {
    let field = schema.realAndComputedFields.get(key);
    if (typeof value === 'string') {
      return [ `${safeIdentifier(field.queryFieldName)}=`, { param: value }];
    }
    if (Array.isArray(value)){
      return any(value.map(item => this.fieldFilter(branch, schema, key, item)));
    }
    throw new Error("Unimplemented field value");
  }
 });

const safePattern = /^[a-zA-Z_0-9]+$/;
function safeIdentifier(identifier){
  if (!safePattern.test(identifier)){
    throw new Error(`possible not safe SQL identifier: ${identifier}`);
  }
  return identifier;
}

function addExplicitParens(expression){
  return ['(', ...expression, ')'];
}

function every(expressions){
  if (expressions.length === 0){
    return ['true'];
  }
  return expressions.map(addExplicitParens).reduce((accum, expression) => [...accum, 'AND', ...expression]);
}

function any(expressions){
  if (expressions.length === 0){
    return ['false'];
  }
  return expressions.map(addExplicitParens).reduce((accum, expression) => [...accum, 'OR', ...expression]);
}

function queryToSQL(query){
  let values = [];
  let text = query.map(element =>{
    if (element.param) {
      values.push(element.param);
      return `$${values.length}`;
    } else {
      return element;
    }
  }).join(' ');
  return {
    text,
    values
  };
}