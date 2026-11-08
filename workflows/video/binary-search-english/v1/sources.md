# Sources and editorial conventions

- Princeton Algorithms, §1.1, binary search on sorted input: https://algs4.cs.princeton.edu/11model/ . Supports midpoint comparisons and eliminating the impossible half; not a measured performance benchmark.
- Exact count is derived from the stated inclusive-bound implementation: midpoint `lo + floor((hi-lo)/2)`; strict comparison updates to `mid+1`/`mid-1`. Worst case for n≥1: floor(log2(n))+1. For n=1,000,000 that is 20 positions inspected; early equality can finish sooner.
- Large example uses a[i]=i+1, target 1,000,000. Small example: [2,5,8,12,16,23,38,56,72,91,104,120], target91; midpoint indexes5,8,10,9. Missing target90 ends with empty bounds.
- 2^19=524,288; 2^20=1,048,576. Approximate repeated-halving intuition is distinguished from exact discrete candidate counts.
- Counters are positions inspected, not machine instructions, individual comparison operators, elapsed seconds or measured speed ratios. Aggregate bins do not each represent one cell. Different display pacing is labeled explicitly.
- Sorting and maintaining order have a cost. This episode does not claim sorting is worthwhile for every one-off search, or analyze storage access costs for every data structure.
- Qwen official CustomVoice/English/Ryan reference: https://github.com/QwenLM/Qwen3-TTS . Speech text is not an independently verified transcription.
- Remotion local rendering/audio: https://www.remotion.dev/docs/renderer/render-media and https://www.remotion.dev/docs/audio . Installed dependencies remain pinned; current documentation is not version-specific certification.

No external photos, music, fabricated interviews, performance measurements or paid content sources are used. Exact speech and final media require human review.
