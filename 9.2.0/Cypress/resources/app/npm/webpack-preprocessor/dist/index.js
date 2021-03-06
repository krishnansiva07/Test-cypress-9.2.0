"use strict";
var typescript_overrides_1 = require("./lib/typescript-overrides");
var Promise = require("bluebird");
var _ = require("lodash");
var webpack = require("webpack");
var deferred_1 = require("./deferred");
var path = require('path');
var debug = require('debug')('cypress:webpack');
var debugStats = require('debug')('cypress:webpack:stats');
// bundle promises from input spec filename to output bundled file paths
var bundles = {};
// we don't automatically load the rules, so that the babel dependencies are
// not required if a user passes in their own configuration
var getDefaultWebpackOptions = function () {
    debug('load default options');
    return {
        mode: 'development',
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    exclude: [/node_modules/],
                    use: [
                        {
                            loader: 'babel-loader',
                            options: {
                                presets: ['@babel/preset-env'],
                            },
                        },
                    ],
                },
            ],
        },
    };
};
var replaceErrMessage = function (err, partToReplace, replaceWith) {
    if (replaceWith === void 0) { replaceWith = ''; }
    err.message = _.trim(err.message.replace(partToReplace, replaceWith));
    if (err.stack) {
        err.stack = _.trim(err.stack.replace(partToReplace, replaceWith));
    }
    return err;
};
var cleanModuleNotFoundError = function (err) {
    var message = err.message;
    if (!message.includes('Module not found'))
        return err;
    // Webpack 5 error messages are much less verbose. No need to clean.
    if ('NormalModule' in webpack) {
        return err;
    }
    var startIndex = message.lastIndexOf('resolve ');
    var endIndex = message.lastIndexOf("doesn't exist") + "doesn't exist".length;
    var partToReplace = message.substring(startIndex, endIndex);
    var newMessagePart = "Looked for and couldn't find the file at the following paths:";
    return replaceErrMessage(err, partToReplace, newMessagePart);
};
var cleanMultiNonsense = function (err) {
    var message = err.message;
    var startIndex = message.indexOf('@ multi');
    if (startIndex < 0)
        return err;
    var partToReplace = message.substring(startIndex);
    return replaceErrMessage(err, partToReplace);
};
var quietErrorMessage = function (err) {
    if (!err || !err.message)
        return err;
    err = cleanModuleNotFoundError(err);
    err = cleanMultiNonsense(err);
    return err;
};
/**
 * Webpack preprocessor configuration function. Takes configuration object
 * and returns file preprocessor.
 * @example
  ```
  on('file:preprocessor', webpackPreprocessor(options))
  ```
 */
// @ts-ignore
var preprocessor = function (options) {
    if (options === void 0) { options = {}; }
    debug('user options: %o', options);
    // we return function that accepts the arguments provided by
    // the event 'file:preprocessor'
    //
    // this function will get called for the support file when a project is loaded
    // (if the support file is not disabled)
    // it will also get called for a spec file when that spec is requested by
    // the Cypress runner
    //
    // when running in the GUI, it will likely get called multiple times
    // with the same filePath, as the user could re-run the tests, causing
    // the supported file and spec file to be requested again
    return function (file) {
        var filePath = file.filePath;
        debug('get', filePath);
        // since this function can get called multiple times with the same
        // filePath, we return the cached bundle promise if we already have one
        // since we don't want or need to re-initiate webpack for it
        if (bundles[filePath]) {
            debug("already have bundle for " + filePath);
            return bundles[filePath].promise;
        }
        var defaultWebpackOptions = getDefaultWebpackOptions();
        // we're provided a default output path that lives alongside Cypress's
        // app data files so we don't have to worry about where to put the bundled
        // file on disk
        var outputPath = path.extname(file.outputPath) === '.js'
            ? file.outputPath
            : file.outputPath + ".js";
        var entry = [filePath].concat(options.additionalEntries || []);
        var watchOptions = options.watchOptions || {};
        // user can override the default options
        var webpackOptions = _
            .chain(options.webpackOptions)
            .defaultTo(defaultWebpackOptions)
            .defaults({
            mode: defaultWebpackOptions.mode,
        })
            .assign({
            // we need to set entry and output
            entry: entry,
            output: {
                path: path.dirname(outputPath),
                filename: path.basename(outputPath),
            },
        })
            .tap(function (opts) {
            if (opts.devtool === false) {
                // disable any overrides if we've explictly turned off sourcemaps
                (0, typescript_overrides_1.overrideSourceMaps)(false, options.typescript);
                return;
            }
            debug('setting devtool to inline-source-map');
            opts.devtool = 'inline-source-map';
            // override typescript to always generate proper source maps
            (0, typescript_overrides_1.overrideSourceMaps)(true, options.typescript);
        })
            .value();
        debug('webpackOptions: %o', webpackOptions);
        debug('watchOptions: %o', watchOptions);
        if (options.typescript)
            debug('typescript: %s', options.typescript);
        debug("input: " + filePath);
        debug("output: " + outputPath);
        var compiler = webpack(webpackOptions);
        var firstBundle = (0, deferred_1.createDeferred)();
        // cache the bundle promise, so it can be returned if this function
        // is invoked again with the same filePath
        bundles[filePath] = {
            promise: firstBundle.promise,
            // we will resolve all reject everything in this array when a compile completes in the `handle` function
            deferreds: [firstBundle],
            initial: true,
        };
        var rejectWithErr = function (err) {
            err = quietErrorMessage(err);
            // @ts-ignore
            err.filePath = filePath;
            debug("errored bundling " + outputPath, err.message);
            var lastBundle = bundles[filePath].deferreds[bundles[filePath].deferreds.length - 1];
            lastBundle.reject(err);
            bundles[filePath].deferreds.length = 0;
        };
        // this function is called when bundling is finished, once at the start
        // and, if watching, each time watching triggers a re-bundle
        var handle = function (err, stats) {
            if (err) {
                debug('handle - had error', err.message);
                return rejectWithErr(err);
            }
            var jsonStats = stats.toJson();
            // these stats are really only useful for debugging
            if (jsonStats.warnings.length > 0) {
                debug("warnings for " + outputPath + " %o", jsonStats.warnings);
            }
            if (stats.hasErrors()) {
                err = new Error('Webpack Compilation Error');
                var errorsToAppend = jsonStats.errors
                    // remove stack trace lines since they're useless for debugging
                    .map(cleanseError)
                    // multiple errors separated by newline
                    .join('\n\n');
                err.message += "\n" + errorsToAppend;
                debug('stats had error(s) %o', jsonStats.errors);
                return rejectWithErr(err);
            }
            debug('finished bundling', outputPath);
            if (debugStats.enabled) {
                /* eslint-disable-next-line no-console */
                console.error(stats.toString({ colors: true }));
            }
            // resolve with the outputPath so Cypress knows where to serve
            // the file from
            // Seems to be a race condition where changing file before next tick
            // does not cause build to rerun
            Promise.delay(0).then(function () {
                if (!bundles[filePath]) {
                    return;
                }
                bundles[filePath].deferreds.forEach(function (deferred) {
                    deferred.resolve(outputPath);
                });
                bundles[filePath].deferreds.length = 0;
            });
        };
        // this event is triggered when watching and a file is saved
        var plugin = { name: 'CypressWebpackPreprocessor' };
        var onCompile = function () {
            debug('compile', filePath);
            var nextBundle = (0, deferred_1.createDeferred)();
            bundles[filePath].promise = nextBundle.promise;
            bundles[filePath].deferreds.push(nextBundle);
            bundles[filePath].promise.finally(function () {
                debug('- compile finished for %s, initial? %s', filePath, bundles[filePath].initial);
                // when the bundling is finished, emit 'rerun' to let Cypress
                // know to rerun the spec, but NOT when it is the initial
                // bundling of the file
                if (!bundles[filePath].initial) {
                    file.emit('rerun');
                }
                bundles[filePath].initial = false;
            })
                // we suppress unhandled rejections so they don't bubble up to the
                // unhandledRejection handler and crash the process. Cypress will
                // eventually take care of the rejection when the file is requested.
                // note that this does not work if attached to latestBundle.promise
                // for some reason. it only works when attached after .finally  ??\_(???)_/??
                .suppressUnhandledRejections();
        };
        // when we should watch, we hook into the 'compile' hook so we know when
        // to rerun the tests
        if (file.shouldWatch) {
            if (compiler.hooks) {
                // TODO compile.tap takes "string | Tap"
                // so seems we just need to pass plugin.name
                // @ts-ignore
                compiler.hooks.compile.tap(plugin, onCompile);
            }
            else if ('plugin' in compiler) {
                // @ts-ignore
                compiler.plugin('compile', onCompile);
            }
        }
        var bundler = file.shouldWatch ? compiler.watch(watchOptions, handle) : compiler.run(handle);
        // when the spec or project is closed, we need to clean up the cached
        // bundle promise and stop the watcher via `bundler.close()`
        file.on('close', function (cb) {
            if (cb === void 0) { cb = function () { }; }
            debug('close', filePath);
            delete bundles[filePath];
            if (file.shouldWatch) {
                // in this case the bundler is webpack.Compiler.Watching
                if (bundler && 'close' in bundler) {
                    bundler.close(cb);
                }
            }
        });
        // return the promise, which will resolve with the outputPath or reject
        // with any error encountered
        return bundles[filePath].promise;
    };
};
// provide a clone of the default options
Object.defineProperty(preprocessor, 'defaultOptions', {
    get: function () {
        debug('get default options');
        return {
            webpackOptions: getDefaultWebpackOptions(),
            watchOptions: {},
        };
    },
});
// for testing purposes, but do not add this to the typescript interface
// @ts-ignore
preprocessor.__reset = function () {
    bundles = {};
};
// for testing purposes, but do not add this to the typescript interface
// @ts-ignore
preprocessor.__bundles = function () {
    return bundles;
};
// @ts-ignore - webpack.StatsError is unique to webpack 5
// TODO: Remove this when we update to webpack 5.
function cleanseError(err) {
    var msg = typeof err === 'string' ? err : err.message;
    return msg.replace(/\n\s*at.*/g, '').replace(/From previous event:\n?/g, '');
}
module.exports = preprocessor;
