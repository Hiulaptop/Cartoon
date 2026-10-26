import { Command, END, MemorySaver, START, StateGraph, interrupt } from "@langchain/langgraph";

const State = new StateGraph({
  channels: {
    candidate: { value: (_current, next) => next, default: () => null },
    decision: { value: (_current, next) => next, default: () => null },
  },
});

const graph = State.addNode("review", async (state) => ({
  decision: interrupt({ candidate: state.candidate }),
}))
  .addEdge(START, "review")
  .addEdge("review", END)
  .compile({ checkpointer: new MemorySaver() });

const config = { configurable: { thread_id: "algorithm-video-interrupt-spike" } };
const paused = await graph.invoke({ candidate: { id: "candidate-v1", answer: "draft" } }, config);
if (!paused.__interrupt__?.length) throw new Error("Graph did not pause at interrupt");

const response = { approved: true, revisionId: "revision-v1" };
const resumed = await graph.invoke(new Command({ resume: response }), config);
if (JSON.stringify(resumed.decision) !== JSON.stringify(response)) {
  throw new Error("Resume payload was not returned as interrupt() result");
}

console.log(JSON.stringify({ paused: paused.__interrupt__[0].value, resumed: resumed.decision }));
