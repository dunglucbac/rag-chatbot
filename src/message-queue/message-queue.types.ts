import { EventEnvelope } from '@modules/common/common.types';

export type EventHandler = (envelope: EventEnvelope) => Promise<void>;
