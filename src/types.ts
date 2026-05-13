export type UserRole = 'admin' | 'editor' | 'viewer';

export type MaintenanceType = 'وقائية' | 'تصحيحية' | 'طارئة';

export interface MaintenanceRow {
  num: number;
  type: MaintenanceType;
  equip: string;
  loc: string;
  work: string;
  notes: string;
}

export interface WaterQualityData {
  time: string;
  temp: string;
  turbidity: string;
  freeChlorine: string;
  ph: string;
  conductivity: string;
  tds: string;
  iron: string;
  notes: string;
}

export interface ReportData {
  id: number;
  savedAt: string;
  dayName: string;
  dateGreg: string;
  dateHijri: string;
  opCompany: string;
  city: string;
  sector: string;
  station: string;
  beneficiary: string;
  waterSource: string;
  designProd: string;
  opMode: string;
  totalWells: string;
  activeWells: string;
  reverseOsmosis: string;
  wellNumbers: string;
  
  // Production
  nasah_prod: string;
  nasah_hpp: string;
  nasah_pump_total: string;
  nasah_pump_out: string;
  nasah_pump_reason: string;
  nasah_notes: string;
  
  manf_prod: string;
  manf_hpp: string;
  manf_pump_total: string;
  manf_pump_out: string;
  manf_pump_reason: string;
  manf_notes: string;

  // Equipment Table Data (Simplified for structure)
  equipment: {
    lift: EquipmentStatus;
    trans: EquipmentStatus;
    chlor: EquipmentStatus;
    starter: EquipmentStatus;
    gen: EquipmentStatus;
    elec: EquipmentStatus;
  };

  opNotes: string;
  maintRows: MaintenanceRow[];
  maintNotes: string;

  quality: {
    raw: WaterQualityData;
    prod: WaterQualityData;
    rej: WaterQualityData;
  };

  supervisor: string;
  nwcSupervisor: string;
  authorId?: string;
  firebaseId?: string;
}

export interface EquipmentStatus {
  loc: string;
  total: string;
  active: string;
  out: string;
  reason: string;
}
