const spawn = require('child_process').spawn;

exports.inRepo = function(path) {
  return new RepoExplorer(path);
};

class RepoExplorer {
  constructor(path) {
    this.path = path;
  }
  runGit(...args) {
    return run('git', args, { cwd: this.path });
  }
  async getCommit(which) {
    let props = Object.keys(formats);
    let result = await this.runGit('show', which, `--format=format:${props.map(p => '%' + formats[p]).join('|')}`);
    let values = result.stdout.split('|');
    let output = {};
    for (let i = 0; i < props.length; i++) {
      output[props[i]] = values[i];
    }
    return output;
  }
}

const formats = {
  id: 'H',
  authorName: 'an',
  authorEmail: 'ae',
  authorDate: 'aI',
  message: 'B'
};

function run(command, args, opts) {
  return new Promise(function(resolve, reject) {
    let p = spawn(command, args, opts || {});
    let stderr = '';
    let stdout = '';
    p.stdout.on('data', function(output) {
      stdout += output;
    });
    p.stderr.on('data', function(output) {
      stderr += output;
    });
    p.on('close', function(code){
      if (code !== 0) {
        let err = new Error(command + " " + args.join(" ") + " exited with nonzero status");
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
