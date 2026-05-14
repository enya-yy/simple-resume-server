/**
 * 运营聚合中 `error_code` 为空时的统一键（与 DB 中 `COALESCE(error_code, …)` 对齐）。
 */
export const OPS_AGGREGATE_NO_ERROR_CODE = 'NO_CODE' as const;
