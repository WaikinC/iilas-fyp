import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { canViewDashboardReviewAlerts, type DashboardReviewRecords, type DashboardRow } from './dashboardData';

export const dashboardReviewLimit = 20;
const feeds = [
  ['deliveryAI', 'deliveryAIExperiments'],
  ['deliveryRules', 'deliveryAbnormalityAssessments'],
  ['integrityExceptions', 'integrityExceptions'],
] as const;
type Kind = keyof DashboardReviewRecords;
type Feed = { rows: DashboardRow[]; status: 'ready' | 'error' };
type FeedState = Partial<Record<Kind, Feed>>;

export function useDashboardReviewRecords(scope: string, role: string, uid: string) {
  const enabled = canViewDashboardReviewAlerts(role);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([scope, role, uid, attempt]);
  const [state, setState] = useState<{ key: string; feeds: FeedState }>({ key: '', feeds: {} });

  useEffect(() => {
    if (!enabled || !db) return;
    const store = db;
    let current = true;
    function publish(kind: Kind, result: Feed) {
      if (current) setState(previous => ({
        key, feeds: { ...(previous.key === key ? previous.feeds : {}), [kind]: result },
      }));
    }
    const stops = feeds.map(([kind, name]) => onSnapshot(
      query(collection(store, name), where('ownerId', '==', scope),
        ...(kind === 'integrityExceptions' ? [where('status', 'in', ['Open', 'NeedsFollowUp'])] : []),
        orderBy('createdAt', 'desc'), limit(dashboardReviewLimit)),
      snapshot => publish(kind, { status: 'ready', rows: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) }),
      () => publish(kind, { status: 'error', rows: [] }),
    ));
    return () => { current = false; stops.forEach(stop => stop()); };
  }, [enabled, key, scope]);

  const current = enabled && state.key === key ? state.feeds : {};
  const status = (kind: Kind) => !db ? 'error' : current[kind]?.status ?? 'loading';
  const records: DashboardReviewRecords = {
    deliveryAI: current.deliveryAI?.rows ?? [],
    deliveryRules: current.deliveryRules?.rows ?? [],
    integrityExceptions: current.integrityExceptions?.rows ?? [],
  };
  return {
    enabled, records, status,
    loading: enabled && feeds.some(([kind]) => status(kind) === 'loading'),
    failed: enabled && feeds.some(([kind]) => status(kind) === 'error'),
    retry: () => setAttempt(value => value + 1),
  };
}
