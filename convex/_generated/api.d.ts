/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cvProcessing from "../cvProcessing.js";
import type * as cvs from "../cvs.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as m365_actions from "../m365/actions.js";
import type * as m365_db from "../m365/db.js";
import type * as pipeline from "../pipeline.js";
import type * as searchHistory from "../searchHistory.js";
import type * as users from "../users.js";
import type * as workable_actions from "../workable/actions.js";
import type * as workable_cleanup from "../workable/cleanup.js";
import type * as workable_cleanupAction from "../workable/cleanupAction.js";
import type * as workable_db from "../workable/db.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cvProcessing: typeof cvProcessing;
  cvs: typeof cvs;
  http: typeof http;
  jobs: typeof jobs;
  "m365/actions": typeof m365_actions;
  "m365/db": typeof m365_db;
  pipeline: typeof pipeline;
  searchHistory: typeof searchHistory;
  users: typeof users;
  "workable/actions": typeof workable_actions;
  "workable/cleanup": typeof workable_cleanup;
  "workable/cleanupAction": typeof workable_cleanupAction;
  "workable/db": typeof workable_db;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
