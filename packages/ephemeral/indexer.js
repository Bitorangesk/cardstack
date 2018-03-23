const { declareInjections } = require('@cardstack/di');

module.exports = declareInjections({
  service: `plugin-services:${require.resolve('./service')}`
}, class Indexer {

  async branches() {
    return ['master'];
  }

  async beginUpdate(branch, readOtherIndexers) {
    let storage = await this.service.findOrCreateStorage(this.dataSource.id, this.initialModels, readOtherIndexers);
    return new Updater(storage, this.dataSource.id);
  }
});

class Updater {
  constructor(storage, dataSourceId) {
    this.storage = storage;
    this.name = 'ephemeral';
    this.dataSourceId = dataSourceId;
  }

  async schema() {
    return this.storage.schemaModels();
  }

  async updateContent(meta, hints, ops) {
    await this.storage.maybeTriggerDelayedValidation();
    let generation, identity;
    if (meta) {
      generation = meta.generation;
      identity = meta.identity;
    }
    let newGeneration = this.storage.currentGeneration();

    if (identity !== this.storage.identity) {
      generation = null;
      await ops.beginReplaceAll();
    }

    for (let entry of this.storage.modelsNewerThan(generation)) {
      if (entry.model) {
        await ops.save(entry.type, entry.id, Object.assign({}, entry.model, { meta: { version: String(entry.generation) } }));
      } else {
        await ops.delete(entry.type, entry.id);
      }
    }

    if (identity !== this.storage.identity) {
      await ops.finishReplaceAll();
    }

    return {
      generation: newGeneration,
      identity: this.storage.identity
    };
  }

  async read(type, id /*, isSchema */) {
    return this.storage.lookup(type, id);
  }
}
