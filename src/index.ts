import loaderUtils from "loader-utils";
import { validate } from "schema-utils";
import {
  readFile as readFileAsync,
  readFileSync,
  existsSync,
  statSync,
} from "fs";
import {
  LOADER_NAME,
  MAIN_LOADER_FILE,
  LOADER_REPLACEMENT_CONDITIONS,
  LOADER_OPTIONS_SCHEMA,
  ERROR_TYPES,
  ERROR_MESSAGES,
  HELP_INFO_MESSAGE,
} from "./constants";
import type * as webpack from "webpack";
/**
 * Custom exception formatted to the loader format
 */
function Exception(
  this: typeof Exception & { message?: string; title?: string },
  options: any
) {
  const defaultOptions = { name: `\n[${LOADER_NAME}]` };
  Object.assign(this, defaultOptions, options);
  this.message = `${this.title || ""}\n  ${this.message}\n`;
  Error.call(this);
  Error.captureStackTrace(this, Exception);
}
Exception.prototype = Object.create(Error.prototype);

/**
 * Format schema error to the loader format
 * @param {Object} e Error object
 * @return {Object}
 */
// function prepareErrorSchemaMessage(e) {
//   let message = "";
//   e.errors &&
//     e.errors.forEach((error: { dataPath: string; keyword: string | number; message: any; }) => {
//       const dataPath =
//         (error.dataPath && error.dataPath.replace(/^\.+/, "")) || "";
//       const property = LOADER_OPTIONS_SCHEMA.properties[dataPath] || {};
//       const errorMessages = property && property.errorMessages;
//       message += `\n  [options.${dataPath}]: ${
//         (errorMessages && errorMessages[error.keyword]) || error.message
//       }`;
//     });
//   e.name = `\n[${LOADER_NAME}]`;
//   e.message = `${
//     message ? `${ERROR_TYPES[0]} ${message}\n` : e.message
//   } ${HELP_INFO_MESSAGE}`;
//   return e;
// }

/**
 * Progress function factory
 * @param {Object} options Options object
 * @return {Function} Progress function
 */
const progressFactory = function ({ progress }: { progress: Function }) {
  if (!progress) return () => {};
  let isFirstMessage = true;
  /**
   * Print progress message
   * @param {String} message
   */
  return (message: string) => {
    const newLine = (isFirstMessage === true && "\n") || "";
    console.info(`${newLine}[${LOADER_NAME}]: ${message}`);
    isFirstMessage = false;
  };
};

function readFile(
  path: string,
  isAsync: boolean,
  callback?: (args: any) => any
) {
  if (isAsync) {
    return readFileAsync(path, null, (err, content) => {
      // err &&
      //   new Exception({
      //     title: ERROR_TYPES[2],
      //     message: err.message,
      //   });
      callback?.(content);
    });
  } else {
    return readFileSync(path, { flag: "r" });
  }
}

function getOptions(loaderContext: any) {
  const hasLoaderContextGetOptionsFunc =
    typeof loaderContext.getOptions === "function"; // Since Webpack 5, getOptions function is part of loader context
  const options = hasLoaderContextGetOptionsFunc
    ? loaderContext.getOptions(LOADER_OPTIONS_SCHEMA)
    : loaderUtils.getOptions(loaderContext);
  const properties = Object.keys(LOADER_OPTIONS_SCHEMA.properties as any) || [];
  const defaultOptions = {} as { [key: string]: any };
  properties.forEach(
    (key) =>
      (defaultOptions[key] = (LOADER_OPTIONS_SCHEMA.properties as any)[
        key
      ].default)
  );
  const result = Object.assign({}, defaultOptions, options);
  //result.replacement && (result.replacement = resolve(loaderContext.context, result.replacement));
  return result;
}

/**
 * Checks the condition by compliance
 * @param {String} condition
 * @return {Proof}
 */
function condition(condition: string) {
  const Proof = function (
    this: typeof Proof & { oneOf: () => any; is: () => boolean },
    condition: string
  ) {
    this.oneOf = function () {
      const args = Array.from(arguments || []);
      return args.some((arg) => arg === condition);
    };
    this.is = function () {
      return condition === arguments[0];
    };
  } as any;
  return new Proof(condition);
}

/** Enable raw input from webpack
 *
 * This asks webpack to provide us a Buffer instead of a String.
 *
 * We need this to avoid corrupting binary files when returning
 * the input unmodified.
 *
 */
export const raw = true;

/**
 * File Replace Loader function
 */
export default function (
  this: webpack.LoaderContext<{ resourcePath: string }>,
  source: string | Buffer
) {
  const options = getOptions(this);
  const isAsync = options && options.async === true;
  const callback = (isAsync === true && this.async()) || null;
  const context = this.context;
  const replacement = (resourcePath: string) => {
    const opts = { context };
    return options.replacement instanceof Function
      ? options.replacement(resourcePath, opts) || null
      : options.replacement;
  };
  const progress = progressFactory(options);

  /**
   * Validate loader options before its work
   */
  try {
    progress(`Validate options`);
    validate(LOADER_OPTIONS_SCHEMA, options);
  } catch (e) {
    // throw prepareErrorSchemaMessage(e);
  }

  /**
   * Checking using with other loaders
   */
  // if (this.loaders.length > 1) {
  //   progress(`Checking using with other loaders`);
  //   const firstLoader = this.loaders[this.loaders.length - 1];
  //   const isNotFirst = firstLoader.path !== MAIN_LOADER_FILE;

  //   if (isNotFirst) {
  //     throw new Exception({
  //       title: ERROR_TYPES[3],
  //       message: ERROR_MESSAGES[3],
  //     });
  //   }
  // }

  /**
   * If condition is 'always' or true
   */
  if (
    condition(options.condition).oneOf(
      LOADER_REPLACEMENT_CONDITIONS[1],
      LOADER_REPLACEMENT_CONDITIONS[2]
    )
  ) {
    progress(`Trying replace by condition '${options.condition}'`);
    console.log(this.resourcePath, "this.resourcePath------------");
    const replacementPath = replacement(this.resourcePath);
    const isTheSamePath = replacementPath === this.resourcePath;
    if (replacementPath === null || isTheSamePath) {
      isTheSamePath &&
        progress(
          `Skip replace because replacement returned the same path [${replacementPath}]`
        );
      return isAsync ? callback?.(null, source) : source; // Skip replacement
    }
    if (existsSync(replacementPath)) {
      progress(`Replace [${this.resourcePath}] -> [${replacementPath}]`);
      this.addDependency(replacementPath);
      console.log(replacementPath, "replacementPath----------");

      return isAsync
        ? readFile(
            replacementPath,
            true,
            (content: string | Buffer | undefined) => {
              callback?.(null, content);
            }
          )
        : readFile(replacementPath, false);
    } else {
      // throw new Exception({
      //   title: ERROR_TYPES[1],
      //   message: ERROR_MESSAGES[0].replace("$1", replacementPath),
      // });
    }
  }

  /**
   * If condition is 'if-replacement-exists'
   */
  if (condition(options.condition).is(LOADER_REPLACEMENT_CONDITIONS[4])) {
    progress(`Trying replace by condition '${options.condition}'`);
    const replacementPath = replacement(this.resourcePath);
    const isTheSamePath = replacementPath === this.resourcePath;
    if (replacementPath === null || isTheSamePath) {
      isTheSamePath &&
        progress(
          `Skip replace because replacement returned the same path [${replacementPath}]`
        );
      return isAsync ? callback?.(null, source) : source; // Skip replacement
    }
    if (existsSync(replacementPath)) {
      progress(`Replace [${this.resourcePath}] -> [${replacementPath}]`);
      this.addDependency(replacementPath);
      return isAsync
        ? readFile(
            replacementPath,
            true,
            (content: string | Buffer | undefined) => {
              callback?.(null, content);
            }
          )
        : readFile(replacementPath, false);
    } else {
      return isAsync ? callback?.(null, source) : source;
    }
  }

  /**
   * If condition is 'if-source-is-empty'
   */
  if (condition(options.condition).is(LOADER_REPLACEMENT_CONDITIONS[5])) {
    progress(`Trying replace by condition '${options.condition}'`);
    const replacementPath = replacement(this.resourcePath);
    const isTheSamePath = replacementPath === this.resourcePath;
    if (replacementPath === null || isTheSamePath) {
      isTheSamePath &&
        progress(
          `Skip replace because replacement returned the same path [${replacementPath}]`
        );
      return isAsync ? callback?.(null, source) : source; // Skip replacement
    }
    if (existsSync(replacementPath)) {
      const stat = statSync(this.resourcePath);
      if (stat.size === 0) {
        progress(`Replace [${this.resourcePath}] -> [${replacementPath}]`);
        this.addDependency(replacementPath);
        return isAsync
          ? readFile(
              replacementPath,
              true,
              (content: string | Buffer | undefined) => {
                callback?.(null, content);
              }
            )
          : readFile(replacementPath, false);
      } else {
        progress(
          `Skip replacement because source file [${this.resourcePath}] is not empty`
        );
        return isAsync ? callback?.(null, source) : source;
      }
    } else {
      // throw new Exception({
      //   title: ERROR_TYPES[1],
      //   message: ERROR_MESSAGES[1].replace("$1", replacementPath),
      // });
    }
  }

  /**
   * If condition is 'never' or false
   */
  // if (
  //   condition(options.condition).oneOf(
  //     LOADER_REPLACEMENT_CONDITIONS[0],
  //     LOADER_REPLACEMENT_CONDITIONS[3]
  //   )
  // ) {
  //   progress(`Skip replacement because condition is '${options.condition}'`);
  //   return isAsync ? callback(null, source) : source;
  // }
}
