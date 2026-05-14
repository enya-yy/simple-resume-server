/**
 * 异步导出作业（worker / DB `export_jobs`）错误码，与 API 层 `ERROR_CODES` 命名空间分离。
 */
export const EXPORT_JOB_ERROR_CODES = {
  /** Worker 捕获未分类异常时的通用终态 */
  EXPORT_JOB_FAILED: "EXPORT_JOB_FAILED",
  /** PDF 渲染失败（未来真实渲染路径） */
  EXPORT_RENDER_FAILED: "EXPORT_RENDER_FAILED",
  /** 对象存储写入失败 */
  EXPORT_STORAGE_FAILED: "EXPORT_STORAGE_FAILED",
  /** 队列/调度相关失败 */
  EXPORT_QUEUE_FAILED: "EXPORT_QUEUE_FAILED",
} as const;

export type ExportJobErrorCode =
  (typeof EXPORT_JOB_ERROR_CODES)[keyof typeof EXPORT_JOB_ERROR_CODES];
