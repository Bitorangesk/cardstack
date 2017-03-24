import { moduleForComponent, test } from 'ember-qunit';
import hbs from 'htmlbars-inline-precompile';
import Ember from 'ember';

let model;

moduleForComponent('cs-version-control', 'Integration | Component | cs version control', {
  integration: true,
  beforeEach() {
    model = Ember.Object.create();
    this.set('model', model);
  }

});

test('render with saved content', function(assert) {
  model.set('hasDirtyFields', false);
  model.set('isNew', false);
  this.render(hbs`{{cs-version-control model=model enabled=true}}`);
  assert.equal(this.$('.cs-version-control-footer button[disabled]').text().trim(), 'Update');
});

test('render with dirty content', function(assert) {
  model.set('hasDirtyFields', true);
  model.set('isNew', false);
  this.render(hbs`{{cs-version-control model=model enabled=true}}`);
  assert.equal(this.$('.cs-version-control-footer button[disabled]').length, 0, 'no disabled button');
  assert.equal(this.$('.cs-version-control-footer button').text().trim(), 'Update');
});

test('clicking update on dirty model triggers save', function(assert) {
  assert.expect(1);
  model.set('save', function() {
    assert.ok(true);
  });
  model.set('hasDirtyFields', true);
  model.set('isNew', false);
  this.render(hbs`{{cs-version-control model=model enabled=true}}`);
  Ember.run(() => {
    this.$('.cs-version-control-footer button').click();
  });
});

test('clicking update on clean model does nothing', function(assert) {
  assert.expect(0);
  model.set('save', function() {
    throw new Error("should not happen");
  });
  model.set('hasDirtyFields', false);
  model.set('isNew', false);
  this.render(hbs`{{cs-version-control model=model enabled=true}}`);
  Ember.run(() => {
    this.$('.cs-version-control-footer button').click();
  });
});
