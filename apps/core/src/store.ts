  getActionByTask(taskId: string): ActionRow | undefined {
    return this.db
      .prepare("SELECT * FROM actions WHERE task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(taskId) as ActionRow | undefined;
  }
