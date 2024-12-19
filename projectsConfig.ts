export interface Project {
  name: string;
  apiEndpoint: string;
  parseResponse: (data: any) => string;
}

export const projects: Project[] = [
  { 
    name: 'Fuel', 
    apiEndpoint: 'https://mainnet-14236c37.fuel.network/allocations?accounts=',
    parseResponse: (data: any) => {
      const fuelData = data as { amount: string };
      return fuelData.amount || '0';
    }
  },
  { 
    name: '$Pingu', 
    apiEndpoint: 'https://api.clusters.xyz/v0.1/airdrops/pengu/eligibility/',
    parseResponse: (data: any) => {
      const pinguData = data as { totalUnclaimed: number };
      return pinguData.totalUnclaimed.toString() || '0';
    }
  },
  { 
    name: 'USUAL', 
    apiEndpoint: 'https://app.usual.money/api/points/',
    parseResponse: (data: any) => {
      const usualData = data as { amount: string };
      return usualData.amount || '0';
    }
  },
]; 