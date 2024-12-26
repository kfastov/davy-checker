import fetch, { type RequestInit } from 'node-fetch';
import { type Project } from './projectsConfig';
import proxies from './proxies.json'; // Import proxies
import { HttpsProxyAgent } from 'https-proxy-agent'; // Import HttpsProxyAgent

interface Task {
  project: Project;
  address: string;
  resolve: (result: string) => void;
  reject: (error: Error | unknown) => void;
}

class AirdropWorker {
  private queue: Task[] = [];
  private isProcessing = false;
  private proxyIndex = 0; // To track the current proxy index
  private useProxies = process.env.ENABLE_PROXIES === 'true'; // Check if proxies should be used

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
      const url = project.apiEndpoint.replace('{address}', address);
      const options: RequestInit = {};

      if (this.useProxies) {
        const proxy = this.getNextProxy();
        options.agent = new HttpsProxyAgent(proxy); // Use HttpsProxyAgent if proxies are enabled
      }

      const response = await fetch(url, options);
      const data = await response.json();
      return project.parseResponse(data);
    } catch (error) {
      console.error('Ошибка при проверке возможности участия в airdrop:', error);
      return 'Ошибка при проверке возможности';
    }
  }

  private getNextProxy(): string {
    const proxy = proxies[this.proxyIndex];
    this.proxyIndex = (this.proxyIndex + 1) % proxies.length; // Round-robin logic
    return proxy;
  }
}

export const airdropWorker = new AirdropWorker();