import { not } from '@ember/object/computed';
import Component from '@ember/component';
import layout from '../../templates/components/field-editors/string-editor';

export default Component.extend({
  layout,
  disabled: not('enabled')
});
