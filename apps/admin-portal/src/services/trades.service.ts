import { apiClient } from './api.service';

export interface PricingSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  min?: number;
  max?: number;
  allowedValues?: string[];
  dependsOn?: {
    field: string;
    equals: string | number | boolean;
  };
}

export interface PricingSchema {
  fields: PricingSchemaField[];
}

export interface TradeConfigResponse {
  id: string;
  trade: string;
  displayName: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
  pricingSchema: PricingSchema | null;
}

export interface UpdateTradeConfigRequest {
  displayName?: string;
  pricingSchema?: PricingSchema;
}

export interface SchemaConflict {
  positionKey: string;
  versionId: string;
  errors: string[];
}

export function listTrades(): Promise<TradeConfigResponse[]> {
  return apiClient.get<TradeConfigResponse[]>('/trades').then((r) => r.data);
}

export function getTrade(trade: string): Promise<TradeConfigResponse> {
  return apiClient.get<TradeConfigResponse>(`/trades/${trade}`).then((r) => r.data);
}

export function updateTrade(
  trade: string,
  data: UpdateTradeConfigRequest,
): Promise<TradeConfigResponse> {
  return apiClient.patch<TradeConfigResponse>(`/trades/${trade}`, data).then((r) => r.data);
}