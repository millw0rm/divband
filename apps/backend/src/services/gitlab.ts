import type { Project } from '../models';

export interface GitLabRepository {
  path: string;
  webUrl: string;
  cloneUrl: string;
}

export class GitLabService {
  async createRepository(project: Project): Promise<GitLabRepository> {
    return {
      path: project.gitlabPath,
      webUrl: `https://gitlab.com/${project.gitlabPath}`,
      cloneUrl: `git@gitlab.com:${project.gitlabPath}.git`,
    };
  }

  async configureRunnerTag(project: Project): Promise<string> {
    return project.runnerTag;
  }
}
