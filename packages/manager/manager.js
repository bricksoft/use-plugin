const use = require("use-plugin");
const ManagerError = (message, name = "ERROR") => {
  const err = new Error();
  err.message = message;
  err.name = name;
  return err;
};

class Manager {
  constructor(pluginPath = "", api, autoInit = true) {
    this.pluginPath = pluginPath;
    this.loader = use({
      module: Manager.module,
      prefix: pluginPath
    });
    this.autoInit = autoInit;
    this.plugins = {};
    this.cache = {};
    const that = this;
    const _api = {
      contributed: {},
      call(endpoint, ...args) {
        if (this[endpoint]) {
          const pluginApi = {
            get api() {
              return that.api;
            }
          };
          return this[endpoint].call(pluginApi, ...args);
        } else {
          throw ManagerError(
            `application api does not expose enpoint ${endpoint}`,
            "ERRNOEXPOINT"
          );
        }
      }
    };
    // create api if undefined
    this.api = api || _api;
    // add api properties
    this.api.contributed = _api.contributed;
    this.api.call = _api.call;
  }
  check(id) {
    return this.load(id, undefined, false, true);
  }
  load(id, args = {}, autoInit = this.autoInit, check = false) {
    // check if plugin is cached and try to load it
    if (!this.cache[id]) {
      // plugin is not yet cached
      if (!check) Manager.logger.debug("trying to load uncached plugin %s", id);
      let descriptor;
      try {
        try {
          descriptor = this.loader(id, args, () => {});
          if (check) return true;
          const plugin = this._load(descriptor, autoInit);
          this.plugins[descriptor.name] = plugin;
          // add plugin to cache
          this.cache[descriptor.name] = plugin;
          this.api.contributed[descriptor.name] = {
            api: plugin.api,
            call: plugin.call
          };
        } catch (error) {
          if (!check) {
            Manager.logger.error(
              "plugin init failed! [%s]",
              (descriptor && descriptor.name) || id,
              error
            );
          }
          return false;
        }
      } catch (error) {
        Manager.logger.error(
          "plugin init failed! [%s]",
          (descriptor && descriptor.name) || id,
          error
        );
        return false;
      }
    } else {
      // plugin is in cache load it from there
      if (!check) Manager.logger.debug("trying to load cached plugin %s", id);
      try {
        const descriptor = this.cache[id].descriptor;
        // even if plugin is cached run initialization
        // to avoid unitialized plugins caused by unload calls
        const plugin = this._load(descriptor, true);
        this.plugins[descriptor.name] = plugin;
        this.api.contributed[descriptor.name] = {
          api: plugin.api,
          call: plugin.call
        };
      } catch (error) {
        if (!check) {
          Manager.logger.error(
            "plugin init failed! [%s]",
            (descriptor && descriptor.name) || id,
            error
          );
        }
        return false;
      }
    }

    return true;
  }
  _load(descriptor, autoInit) {
    const { load, unload, meta, api } = descriptor.init();
    let loadSuccess = true;
    const that = this;
    if (autoInit) {
      try {
        const api = {
          get api() {
            return that.api;
          },
          get info() {
            return descriptor;
          }
        };
        load.call(api, descriptor.options || {});
      } catch (error) {
        Manager.logger.error(error);
        loadSuccess = false;
      }
    }
    return {
      load: load || (() => {}),
      unload: unload || (() => {}),
      api,
      descriptor,
      loadSuccess,
      autoInit: this.autoInit,
      meta,
      call(endpoint, ...args) {
        if (
          meta.contributes &&
          [...meta.contributes].indexOf(endpoint) > -1 &&
          api[endpoint]
        ) {
          const pluginApi = {
            get api() {
              return that.api;
            },
            get info() {
              return this;
            }
          };
          return api[endpoint].call(pluginApi, ...args);
        } else {
          throw ManagerError(
            `plugin ${descriptor.name} does not expose enpoint ${endpoint}`,
            "ERRNOEXPOINT"
          );
        }
      }
    };
  }
  unload(id) {
    if (this.plugins[id]) {
      try {
        // call unload on plugin instance
        this.plugins[id].unload();
        // delete api references
        delete this.plugins[id];
        delete this.api.contributed[id];
      } catch (error) {
        Manager.logger.error("[manager] plugin unload failed! [%s]", id, error);
        return false;
      }
      return true;
    }
    return false;
  }
}
Manager.module = module;
Manager.logger = console;

class ManagerApplication {
  constructor(pluginPath) {
    if (!pluginPath) {
      throw ManagerError("pluginPath is not defined", "ERRNOEXPATH");
    }
    const that = this;
    this.api = {
      contributed: {},
      // api stub (mostly for intellisense)
      call(endpoint, ...args) {},

      // application api
      loadPlugin: that.loadPlugin.bind(that),
      unloadPlugin: that.unloadPlugin.bind(that),
      checkPlugin: that.checkPlugin.bind(that)
    };
    // init api with plugins
    this.host = new Manager(pluginPath, this.api);
  }

  // api
  loadPlugin(plugin, options) {
    return this.host.load(plugin, options);
  }
  unloadPlugin(plugin) {
    return this.host.unload(plugin);
  }
  checkPlugin(plugin) {
    return this.host.check(plugin);
  }
}
ManagerApplication.setLogger = logger => {
  if (logger) {
    Manager.logger = logger;
  } else throw ManagerError("logger is undefined!", "ERRNOLOGGERARG");
};

ManagerApplication.setModule = module => {
  if (module) {
    Manager.module = module;
  } else throw ManagerError("module is undefined!", "ERRNOMODULERARG");
};

module.exports = Manager;
module.exports.Manager = Manager;
module.exports.ManagerApplication = ManagerApplication;
