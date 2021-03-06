const Ember = require('ember-source/dist/ember.debug');
const { dasherize } = Ember.String;

function fieldTypeFor(contractName, abiItem) {
  if (!abiItem || !abiItem.outputs || !abiItem.outputs.length) { return; }

  if (!abiItem.inputs.length) {
    // We are not handling multiple return types for non-mapping functions
    // unclear what that would actually look like in the schema...
    switch(abiItem.outputs[0].type) {
      // Using strings to represent uint256, as the max int
      // int in js is 2^53, vs 2^256 in solidity
      case 'uint8':
      case 'uint16':
      case 'uint32':
      case 'uint64':
      case 'uint128':
      case 'uint256':
      case 'bytes32':
      case 'string':
      case 'address':
        return { fields: [{ type: '@cardstack/core-types::string' }]};
      case 'bool':
        return { fields: [{ type: '@cardstack/core-types::boolean' }]};
    }
  // deal with just mappings that use address as a key for now
  } else if (abiItem.inputs.length === 1 && abiItem.inputs[0].type === "address") {
    return {
      isMapping: true,
      fields: abiItem.outputs.map(output => {
        let name, type, isNamedField;
        if (output.name && abiItem.outputs.length > 1) {
          name = `${dasherize(abiItem.name)}-${dasherize(output.name)}`;
          isNamedField = true;
        }
        switch(output.type) {
          case 'uint8':
          case 'uint16':
          case 'uint32':
          case 'uint64':
          case 'uint128':
          case 'uint256':
            name = name || `mapping-number-value`;
            type = 'number';
            break;
          case 'bool':
            name = name || `mapping-boolean-value`;
            type = 'boolean';
            break;
          case 'bytes32':
          case 'string':
          case 'address':
          default:
            name = name || `mapping-string-value`;
            type = 'string';
        }

        return { name, type, isNamedField };
      })
    };
  }
}

module.exports = {
  fieldTypeFor
};
