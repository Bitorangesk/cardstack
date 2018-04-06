import Component from '@ember/component';
import layout from '../templates/components/cs-active-composition-panel';
import { task, timeout } from 'ember-concurrency';
import scrollToBounds from '../scroll-to-bounds';

export default Component.extend({
  layout,
  classNames: ['cs-active-composition-panel'],

  highlightAndScrollToField: task(function * (field) {
    this.get('highlightField')(field);
    if (field) {
      yield timeout(500);
      scrollToBounds(field.bounds());
    }
  }).restartable()
});
