import { User } from '../types';

export interface MockUser extends User {
  password: string;
}

export const MOCK_USERS: MockUser[] = [
  { id: 'u1', email: 'agent.mtn@mtn.cg',      password: 'Mtn@2024!',    role: 'AGENT_MTN',    operateur: 'MTN',    nom: 'BASSINGA BENIJAH' },
  { id: 'u2', email: 'agent.airtel@airtel.cg', password: 'Airtel@2024!', role: 'AGENT_AIRTEL', operateur: 'AIRTEL', nom: 'BOUINIE BENI' },
  { id: 'u3', email: 'analyste@arpce.cg',      password: 'Analyste@1!',  role: 'ANALYSTE',                          nom: 'BATOUMENI RICH' },
  { id: 'u4', email: 'controleur@arpce.cg',    password: 'Arpce@2024!',  role: 'ARPCE',                             nom: 'NGOUBOU ROCH' },
];
