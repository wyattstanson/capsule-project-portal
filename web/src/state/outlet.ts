import { useOutletContext } from 'react-router-dom';

// The Layout passes a `revision` that ticks on every live SSE event and blade
// action; pages use it as a refetch dependency so screens stay in sync.
export function useRevision(): number {
  return useOutletContext<{ revision: number }>().revision;
}
