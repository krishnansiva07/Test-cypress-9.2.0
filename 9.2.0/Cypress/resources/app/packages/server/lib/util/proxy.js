"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSystemProxySettings = void 0;
const tslib_1 = require("tslib");
const lodash_1 = (0, tslib_1.__importDefault)(require("lodash"));
const debug_1 = (0, tslib_1.__importDefault)(require("debug"));
const os_1 = (0, tslib_1.__importDefault)(require("os"));
const get_windows_proxy_1 = require("./get-windows-proxy");
const debug = (0, debug_1.default)('cypress:server:util:proxy');
const falsyEnv = (v) => {
    return v === 'false' || v === '0' || !v;
};
const copyLowercaseEnvToUppercase = (name) => {
    // uppercase environment variables are used throughout Cypress and dependencies
    // but users sometimes supply these vars as lowercase
    const lowerEnv = process.env[name.toLowerCase()];
    if (lowerEnv) {
        debug('overriding uppercase env var with lowercase %o', { name });
        process.env[name.toUpperCase()] = lowerEnv;
    }
};
const normalizeEnvironmentProxy = () => {
    if (falsyEnv(process.env.HTTP_PROXY)) {
        debug('HTTP_PROXY is falsy, disabling HTTP_PROXY');
        delete process.env.HTTP_PROXY;
    }
    if (!process.env.HTTPS_PROXY && process.env.HTTP_PROXY) {
        // request library will use HTTP_PROXY as a fallback for HTTPS urls, but
        // proxy-from-env will not, so let's just force it to fall back like this
        debug('setting HTTPS_PROXY to HTTP_PROXY since it does not exist');
        process.env.HTTPS_PROXY = process.env.HTTP_PROXY;
    }
    if (!process.env.hasOwnProperty('NO_PROXY')) {
        // don't proxy localhost, to match Chrome's default behavior and user expectation
        debug('setting default NO_PROXY of ``');
        process.env.NO_PROXY = '';
    }
    const noProxyParts = lodash_1.default.compact((process.env.NO_PROXY || '').split(','));
    if (!noProxyParts.includes('<-loopback>')) {
        debug('<-loopback> not found, adding localhost to NO_PROXY');
        process.env.NO_PROXY = noProxyParts.concat([
            '127.0.0.1', '::1', 'localhost',
        ]).join(',');
    }
    debug('normalized proxy environment variables %o', lodash_1.default.pick(process.env, [
        'NO_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY',
    ]));
};
const mergeNpmProxyVars = () => {
    // copy npm's `proxy` and `https-proxy` config if they are set
    // https://github.com/cypress-io/cypress/pull/4705
    [
        ['npm_config_proxy', 'HTTP_PROXY'],
        ['npm_config_https_proxy', 'HTTPS_PROXY'],
    ].forEach(([from, to]) => {
        if (!falsyEnv(process.env[from]) && lodash_1.default.isUndefined(process.env[to])) {
            debug('using npm\'s %s as %s', from, to);
            process.env[to] = process.env[from];
        }
    });
};
const loadSystemProxySettings = () => {
    debug('found proxy environment variables %o', lodash_1.default.pick(process.env, [
        'NO_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY',
        'no_proxy', 'http_proxy', 'https_proxy',
        'npm_config_proxy', 'npm_config_https_proxy', 'npm_config_noproxy',
    ]));
    ['NO_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY'].forEach(copyLowercaseEnvToUppercase);
    mergeNpmProxyVars();
    if (!lodash_1.default.isUndefined(process.env.HTTP_PROXY)) {
        normalizeEnvironmentProxy();
        return;
    }
    if (os_1.default.platform() !== 'win32') {
        return;
    }
    const windowsProxy = (0, get_windows_proxy_1.getWindowsProxy)();
    if (windowsProxy) {
        process.env.HTTP_PROXY = process.env.HTTPS_PROXY = windowsProxy.httpProxy;
        process.env.NO_PROXY = process.env.NO_PROXY || windowsProxy.noProxy;
    }
    normalizeEnvironmentProxy();
    return 'win32';
};
exports.loadSystemProxySettings = loadSystemProxySettings;
