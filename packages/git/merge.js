const {
  Branch,
  Commit,
  Merge,
  Repository,
  Signature,
  Tree,
  setThreadSafetyStatus,
  TreeEntry: { FILEMODE }
} = require('nodegit');
const {
  MutableTree,
  NotFound,
  OverwriteRejected
} = require('./mutable-tree');
const moment = require('moment-timezone');

// This is supposed to enable thread-safe locking around all async
// operations.
setThreadSafetyStatus(1);

function signature(commitOpts) {
  let date = commitOpts.authorDate || moment();
  let author = Signature.create(commitOpts.authorName, commitOpts.authorEmail, date.unix(), date.utcOffset());
  let committer = commitOpts.committerName ? Signature.create(commitOpts.committerName, commitOpts.committerEmail, date.unix(), date.utcOffset()) : author;
  return {
    author,
    committer
  };
}

exports.createEmptyRepo = async function(path, commitOpts) {
  let repo = await Repository.init(path, 1);
  let commit = await makeCommit(repo, null, [], commitOpts);
  await Branch.create(repo, 'master', commit, false);
  return repo;
};

async function makeCommit(repo, parentCommit, operations, commitOpts) {
  let parentTree;
  let parents = [];
  if (parentCommit) {
    parentTree = await parentCommit.getTree();
    parents.push(parentCommit);
  }
  let newRoot = new MutableTree(repo, parentTree);
  for (let { operation, filename, buffer, patcher, patcherThis } of operations) {
    switch (operation) {
    case 'create':
      await newRoot.insertPath(filename, buffer, FILEMODE.BLOB, { allowUpdate: false, allowCreate: true });
      break;
    case 'update':
      await newRoot.insertPath(filename, buffer, FILEMODE.BLOB, { allowUpdate: true, allowCreate: false });
      break;
    case 'patch':
      await newRoot.patchPath(filename, patcher, patcherThis, { allowCreate: false });
      break;
    case 'delete':
      await newRoot.deletePath(filename);
      break;
    case 'createOrUpdate':
      await newRoot.insertPath(filename, buffer, FILEMODE.BLOB, { allowUpdate: true, allowCreate: true } );
      break;
    default:
      throw new Error("no operation");
    }
  }
  let treeOid = await newRoot.write(true);

  if (treeOid && parentTree && treeOid.equal(parentTree.id())) {
    return parentCommit;
  }

  let tree = await Tree.lookup(repo, treeOid, null);
  let { author, committer } = signature(commitOpts);
  let commitOid = await Commit.create(repo, null, author, committer, 'UTF-8', commitOpts.message, tree, parents.length, parents);
  return Commit.lookup(repo, commitOid);
}

exports.mergeCommit = async function(repo, parentId, targetBranch, operations, commitOpts) {
  let headRef = await Branch.lookup(repo, targetBranch, Branch.BRANCH.LOCAL);
  let headCommit = await Commit.lookup(repo, headRef.target());

  let parentCommit;
  if (parentId) {
    parentCommit = await Commit.lookup(repo, parentId);
  } else {
    parentCommit = headCommit;
  }
  let newCommit = await makeCommit(repo, parentCommit, operations, commitOpts);


  let baseOid = await Merge.base(repo, newCommit, headCommit);
  if (baseOid.equal(headCommit.id())) {
    await headRef.setTarget(newCommit.id(), 'fast forward');
    return newCommit.id().tostrS();
  }
  let index = await Merge.commits(repo, newCommit, headCommit, null);
  if (index.hasConflicts()) {
    throw new GitConflict(index);
  }
  let treeOid = await index.writeTreeTo(repo);
  let tree = await Tree.lookup(repo, treeOid, null);
  let { author, committer } = signature(commitOpts);
  let mergeCommitOid = await Commit.create(repo, null, author, committer, 'UTF-8', `Clean merge into ${targetBranch}`, tree, 2, [newCommit, headCommit]);
  let mergeCommit = await Commit.lookup(repo, mergeCommitOid);
  await headRef.setTarget(mergeCommit.id(), 'fast forward');
  return mergeCommit.id().tostrS();
};

class GitConflict extends Error {
  constructor(index) {
    super();
    this.index = index;
  }
}

exports.GitConflict = GitConflict;
exports.NotFound = NotFound;
exports.OverwriteRejected = OverwriteRejected;
