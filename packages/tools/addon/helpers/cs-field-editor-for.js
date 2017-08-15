import Ember from 'ember';

import { fieldType } from '@cardstack/rendering/helpers/cs-field-type';

export function csFieldEditorFor([content, fieldName], { variant }) {
  let type = fieldType(content, fieldName);

  if (!type) {
    return;
  }

  let prefix = '';
  if (variant === 'inline') {
    prefix = 'inline-';
  }
  return `${prefix}field-editors/${type}-editor`;
}

export default Ember.Helper.helper(csFieldEditorFor);
