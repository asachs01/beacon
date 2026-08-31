export interface TaskmateUser {
  childId: string;
  name: string;
  todoListId: string;
}

export interface TaskmateCompletion {
  uid: string;
  summary: string;
  userId: string;
  completedAt: string;
}
