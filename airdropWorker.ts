import fetch from 'node-fetch';
import { type Project } from './projectsConfig';

interface Task {
  project: Project;
  address: string;
  resolve: (result: string) => void;
  reject: (error: any) => void;
}

class AirdropWorker {
  private queue: Task[] = [];
  private isProcessing = false;

  addTask(project: Project, address: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ project, address, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();

    if (task) {
      try {
        const result = await this.checkAirdropEligibility(task.project, task.address);
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }
    }

    this.isProcessing = false;
    this.processQueue();
  }

  private async checkAirdropEligibility(project: Project, address: string): Promise<string> {
    try {
      const url = `${project.apiEndpoint}${address}`;
      const response = await fetch(url);
      const data = await response.json();
      return project.parseResponse(data);
    } catch (error) {
      console.error('Ошибка при проверке возможности участия в airdrop:', error);
      return 'Ошибка при проверке возможности';
    }
  }
}

export const airdropWorker = new AirdropWorker();