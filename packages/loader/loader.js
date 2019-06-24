const noop = () => {};
const defaultMeta = {};

module.exports = ({
  unload = noop,
  load = noop,
  defaults = {},
  meta = defaultMeta,
  ...api
}) => {
  module.parent.exports = () => ({
    load,
    unload,
    meta,
    api
  });
  module.parent.exports.defaults = defaults || {};
};
