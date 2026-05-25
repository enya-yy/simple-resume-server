export type ResumeToolName =
  | 'update_basics'
  | 'add_section_item'
  | 'update_section_item'
  | 'patch_item_bullets'
  | 'delete_section_item';

export type ResumeToolCall = {
  name: ResumeToolName;
  arguments: Record<string, unknown>;
};
