/**
 * Pipeline state schema for LangGraph.
 * Each field uses a reducer so partial updates from nodes are merged correctly.
 */
import { Annotation } from '@langchain/langgraph';

export const PipelineState = Annotation.Root({
  // Immutable config set at graph invocation time
  client:   Annotation({ default: () => '', value: (_, v) => v }),
  slug:     Annotation({ default: () => '', value: (_, v) => v }),

  // Accumulating state — reducers append/sum across node returns
  completedAgents: Annotation({
    default: () => [],
    value: (curr, update) => [...new Set([...curr, ...update])],
  }),
  // Agents whose write_output produced empty/invalid content — eligible for retry
  failedAgents: Annotation({
    default: () => [],
    value: (curr, update) => [...new Set([...curr, ...update])],
  }),
  runningTotalUsd: Annotation({
    default: () => 0,
    value: (curr, update) => curr + update,
  }),
  errors: Annotation({
    default: () => [],
    value: (curr, update) => [...curr, ...update],
  }),

  // Last agent result — overwritten each step (for conditional routing)
  lastResult: Annotation({ default: () => null, value: (_, v) => v }),
});
