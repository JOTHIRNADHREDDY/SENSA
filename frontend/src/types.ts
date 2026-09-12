export type DataStorageMode = 'local' | 'hybrid' | 'cloud';


export interface Point {
  x: number;
  y: number;
}

export interface PolygonZone {
  id: string;
  name: string;
  cameraId: string;
  points: Point[];
  color: string;
  active: boolean;
  dwellTimeSeconds: number;
}

export interface CameraStream {
  id: string;
  code: string;
  name: string;
  location: string;
  brand: string;
  rtspUrl: string;
  status: 'ONLINE' | 'BREACH' | 'WARNING' | 'OFFLINE';
  fps: number;
  confidenceThreshold: number;
  alertsToday: number;
  lastAlertTime?: string;
  detectedType?: 'PERSON' | 'VEHICLE' | 'ZONE BREACH' | 'CLEAR';
  detectionConfidence?: number;
  activeZoneName?: string;
  snapshotBg: string;
}

export interface SecurityAlert {
  id: string;
  cameraId: string;
  cameraName: string;
  location: string;
  timestamp: string;
  threatLevel: 'CRITICAL' | 'WARNING' | 'CLEAR';
  detectionType: string;
  confidence: number;
  whatsappSent: boolean;
  snapshotUrl: string;
  acknowledged: boolean;
  details: string;
}


export interface AiAnalysisResult {
  detectedObjects: string[];
  summary: string;
  threatLevel: 'CRITICAL' | 'WARNING' | 'CLEAR';
  confidence: number;
  zoneBreached: boolean;
  whatsappDraft: string;
  recommendations: string[];
}

export interface BillingSubscription {
  id: string;
  plan_id: 'pilot' | 'base_license' | 'professional' | 'business' | 'enterprise';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'pending' | 'payment_failed';
  billing_cycle: 'monthly' | 'annual';
  currency: string;
  amount_minor: number;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string;
  cancel_at_period_end: boolean;
  payment_method: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  } | null;
  billing_info: {
    company: string;
    name: string;
    email: string;
    country: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    tax_id: string;
  } | null;
}

export interface Invoice {
  id: string;
  date: string;
  description: string;
  amount_minor: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded' | 'void';
  pdf_url?: string;
}
