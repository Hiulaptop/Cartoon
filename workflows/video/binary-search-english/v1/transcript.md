# Binary Search: Why One Million Items Take Only About 20 Steps?

English narration draft. Exact cue text below; visuals are deterministic simulations, not runtime benchmarks.

## One million possibilities

**c01** Imagine one million numbers, already sorted from smallest to largest. Somewhere in that list is your target. How many positions would you need to check?

**c02** Checking from the beginning could take a million checks. But choose each position strategically, and at most twenty checks are enough. Not twenty thousand. Just twenty.

**c03** Try guessing a position without a plan. A wrong guess tells you little unless you use the ordering. This unsystematic guessing is not what we call linear search.

**c04** The trick is not a faster computer, or a lucky guess. It is asking a question whose answer lets you safely throw away a huge number of possibilities.

## One position at a time

**c05** First, meet linear search. Start at the first position, check the value, and move to the next position if it is not the target. Nothing is skipped.

**c06** On this small array, imagine looking for the final value. Each rejected cell costs one more check. The counter measures positions inspected, not seconds or individual processor instructions.

**c07** Now scale that idea to the numbers one through one million. Our target is one million, right at the end. Linear search must inspect every position to reach it.

**c08** The sweeping display is accelerated. Each block represents many positions, not one number. This is an illustration of work, not a stopwatch measurement of a real computer.

**c09** Double the list length, and this worst case doubles too. Linear search can still be useful, especially on small or unsorted collections. It simply does not exploit sorted order here.

**c10** Keep that million-check result in mind. We will search the same ordered list for the same target, but change what we learn from every unsuccessful check.

## Eliminate half the possibilities

**c11** Start with twelve readable values. We want ninety-one. The blue interval contains every position that could still hold it. At the beginning, that means the entire array.

**c12** Inspect the middle position, rounding down when there are two middle choices. The value is twenty-three. Our target, ninety-one, is larger. Which side could possibly contain it?

**c13** Every value to the left is no larger than twenty-three. So none can be ninety-one. Discard that whole section, including the middle value we have already checked.

**c14** Notice the reason this is safe. We are not merely hoping the answer is on the right. The sorted order proves that the discarded values cannot be our target.

**c15** Inside the remaining interval, inspect the middle again. This time it is seventy-two. Ninety-one is larger, so discard everything through seventy-two. Only three candidate positions remain.

**c16** The next middle value is one hundred four. Now the target is smaller. Reverse the direction: discard that middle value and everything to its right. One candidate remains.

**c17** Check that last position. Ninety-one: found. Four inspected positions, rather than checking the first ten values one by one. The arrows show indexes; the cell contents show values.

**c18** This is binary search. Its promise is that, if the target exists, it stays inside the active interval. Every move preserves that promise while making the interval smaller.

**c19** Return to one million positions. Drawing every cell would hide the explanation, so this bar shows the whole interval. Exact boundaries and remaining candidate counts stay visible beside it.

**c20** The first middle value is five hundred thousand. Our target is larger. One check removes half a million positions. We have learned more than merely that one value was wrong.

**c21** Check the middle of the survivors. Then do it again. Watch the candidate count fall while the step counter increases by just one each time. The two numbers tell the story.

**c22** Five checks have already reduced the interval to thirty-one thousand two hundred fifty candidates. That is still many values, but the same strategy continues without changing its rules.

**c23** After ten checks, only nine hundred seventy-six candidates remain in this exact example. The interval is tiny compared with the original list. We magnify the local neighborhood so you can follow it.

**c24** Keep halving. Thirty candidates become fifteen, then seven, then three, then one. These are discrete positions, so rounding matters. The display uses actual search states, not rounded guesses.

**c25** The twentieth check inspects one million and finds the target. Linear search checked a million positions; binary search checked twenty. Their playback speeds are illustrative, not a measured speed ratio.

## Why twenty is enough

**c26** Why does twenty keep appearing? Forget the name of the algorithm for a moment. Ask how many times you must halve a million possibilities before only about one remains.

**c27** One halving gives roughly five hundred thousand. Two give roughly two hundred fifty thousand. Ten halvings reduce the original size by a factor of one thousand twenty-four.

**c28** Now reverse the question. How many times can we double one before passing a million? Nineteen doublings are not enough. Twenty doublings reach one million forty-eight thousand five hundred seventy-six.

**c29** That doubling count is the intuition behind a base-two logarithm. It answers how many factors of two connect one to a size. Only now do we give the pattern its mathematical name.

**c30** For our inclusive-bound search, the exact worst-case count is the whole-number part of the base-two logarithm, plus one. For one million, that is twenty position checks at most.

**c31** Not every target takes twenty checks. A target at the first midpoint is found immediately. The twenty-step claim is a worst-case guarantee for this list size and search convention.

**c32** Double the data, and binary search needs only about one additional check in the worst case. Linear search may need twice as many. That difference in growth is the real advantage.

## The condition that makes it work

**c33** But there is a condition we cannot ignore: the values must be ordered. Put a large value near the beginning and a smaller target on its right, and the elimination argument breaks.

**c34** On an unsorted array, smaller does not mean left. Discarding the right half might discard the answer itself. Binary search is safe because of an ordering guarantee, not because middle positions are magical.

**c35** What if the target is absent? Search the small sorted array for ninety instead. Follow the same comparisons until the lower boundary passes the upper boundary. No candidates remain.

**c36** An empty interval is a valid answer: not found. The method does not need to inspect every value because it has already proved that each discarded region cannot contain ninety.

**c37** Sorting is not free, and keeping changing data sorted has a cost too. For one search, sorting first may be unnecessary. For many searches, that preparation can become worthwhile.

**c38** Remember the picture: one ordered interval, one midpoint, one justified elimination. Repeat. Binary search is fast because each unsuccessful check removes roughly half the remaining possibilities, without losing the target.

**c39** One million positions. At most twenty checks. Not a mysterious trick: a small question with a large consequence. The next question is what it costs to create that useful order.
