/**
 * Built-in curated sheets, mirroring Codolio's Explore Sheets library.
 *
 * These are seeded as `isCurated: true` sheets with no owner, which makes them
 * public, read-only and followable by anyone. See scripts/seedContent.js.
 *
 * Problem refs use the short form documented in ./problemRefs.js.
 */

module.exports = [
  {
    slug: 'blind-75',
    title: 'Blind 75',
    curator: 'Blind',
    category: 'popular',
    icon: '75',
    tags: ['interview', 'must-do', 'dsa'],
    description:
      'The classic 75-question list that covers every pattern you need for a '
      + 'technical interview. If you only do one sheet, do this one.',
    sections: [
      {
        title: 'Arrays & Hashing',
        problems: [
          'lc:two-sum', 'lc:contains-duplicate', 'lc:valid-anagram', 'lc:group-anagrams',
          'lc:top-k-frequent-elements', 'lc:product-of-array-except-self',
          'lc:longest-consecutive-sequence', 'lc:encode-and-decode-strings',
        ],
      },
      {
        title: 'Two Pointers',
        problems: ['lc:valid-palindrome', 'lc:3sum', 'lc:container-with-most-water'],
      },
      {
        title: 'Sliding Window',
        problems: [
          'lc:best-time-to-buy-and-sell-stock',
          'lc:longest-substring-without-repeating-characters',
          'lc:longest-repeating-character-replacement', 'lc:minimum-window-substring',
        ],
      },
      { title: 'Stack', problems: ['lc:valid-parentheses'] },
      {
        title: 'Binary Search',
        problems: [
          'lc:find-minimum-in-rotated-sorted-array', 'lc:search-in-rotated-sorted-array',
        ],
      },
      {
        title: 'Linked List',
        problems: [
          'lc:reverse-linked-list', 'lc:merge-two-sorted-lists', 'lc:reorder-list',
          'lc:remove-nth-node-from-end-of-list', 'lc:linked-list-cycle',
          'lc:merge-k-sorted-lists',
        ],
      },
      {
        title: 'Trees',
        problems: [
          'lc:invert-binary-tree', 'lc:maximum-depth-of-binary-tree', 'lc:same-tree',
          'lc:subtree-of-another-tree',
          'lc:lowest-common-ancestor-of-a-binary-search-tree',
          'lc:binary-tree-level-order-traversal', 'lc:validate-binary-search-tree',
          'lc:kth-smallest-element-in-a-bst',
          'lc:construct-binary-tree-from-preorder-and-inorder-traversal',
          'lc:binary-tree-maximum-path-sum',
          'lc:serialize-and-deserialize-binary-tree',
        ],
      },
      {
        title: 'Tries',
        problems: [
          'lc:implement-trie-prefix-tree', 'lc:design-add-and-search-words-data-structure',
          'lc:word-search-ii',
        ],
      },
      { title: 'Heap / Priority Queue', problems: ['lc:find-median-from-data-stream'] },
      { title: 'Backtracking', problems: ['lc:combination-sum', 'lc:word-search'] },
      {
        title: 'Graphs',
        problems: [
          'lc:number-of-islands', 'lc:clone-graph', 'lc:pacific-atlantic-water-flow',
          'lc:course-schedule', 'lc:graph-valid-tree',
          'lc:number-of-connected-components-in-an-undirected-graph',
        ],
      },
      { title: 'Advanced Graphs', problems: ['lc:alien-dictionary'] },
      {
        title: '1-D Dynamic Programming',
        problems: [
          'lc:climbing-stairs', 'lc:house-robber', 'lc:house-robber-ii',
          'lc:longest-palindromic-substring', 'lc:palindromic-substrings',
          'lc:decode-ways', 'lc:coin-change', 'lc:maximum-product-subarray',
          'lc:word-break', 'lc:longest-increasing-subsequence',
        ],
      },
      {
        title: '2-D Dynamic Programming',
        problems: ['lc:unique-paths', 'lc:longest-common-subsequence'],
      },
      { title: 'Greedy', problems: ['lc:maximum-subarray', 'lc:jump-game'] },
      {
        title: 'Intervals',
        problems: [
          'lc:insert-interval', 'lc:merge-intervals', 'lc:non-overlapping-intervals',
          'lc:meeting-rooms', 'lc:meeting-rooms-ii',
        ],
      },
      {
        title: 'Math & Geometry',
        problems: ['lc:rotate-image', 'lc:spiral-matrix', 'lc:set-matrix-zeroes'],
      },
      {
        title: 'Bit Manipulation',
        problems: [
          'lc:number-of-1-bits', 'lc:counting-bits', 'lc:reverse-bits',
          'lc:missing-number', 'lc:sum-of-two-integers',
        ],
      },
    ],
  },

  {
    slug: 'dp-mastery',
    title: 'DP Mastery',
    curator: 'CodeOvertake',
    category: 'mastery',
    icon: 'DP',
    tags: ['dynamic-programming', 'mastery'],
    description:
      'Dynamic programming from first principles: start with 1-D recurrences, '
      + 'then knapsack, grids, strings and interval DP.',
    sections: [
      {
        title: 'Getting Started (1-D)',
        problems: [
          'lc:climbing-stairs', 'lc:min-cost-climbing-stairs', 'lc:house-robber',
          'lc:house-robber-ii', 'lc:maximum-subarray',
        ],
      },
      {
        title: 'Knapsack Patterns',
        problems: [
          'lc:partition-equal-subset-sum', 'lc:target-sum', 'lc:coin-change',
          'lc:coin-change-ii', 'lc:combination-sum-iv',
        ],
      },
      {
        title: 'Grid DP',
        problems: [
          'lc:unique-paths', 'lc:unique-paths-ii', 'lc:minimum-path-sum',
          'lc:maximal-square', 'lc:triangle',
        ],
      },
      {
        title: 'String DP',
        problems: [
          'lc:longest-common-subsequence', 'lc:edit-distance',
          'lc:longest-palindromic-subsequence', 'lc:distinct-subsequences',
          'lc:word-break', 'lc:regular-expression-matching',
        ],
      },
      {
        title: 'Subsequences & LIS',
        problems: [
          'lc:longest-increasing-subsequence', 'lc:number-of-longest-increasing-subsequence',
          'lc:russian-doll-envelopes',
        ],
      },
      {
        title: 'Interval & Hard DP',
        problems: [
          'lc:burst-balloons', 'lc:palindrome-partitioning-ii',
          'lc:best-time-to-buy-and-sell-stock-iii', 'lc:best-time-to-buy-and-sell-stock-iv',
        ],
      },
    ],
  },

  {
    slug: 'graph-mastery',
    title: 'Graph Mastery',
    curator: 'CodeOvertake',
    category: 'mastery',
    icon: 'GR',
    tags: ['graphs', 'mastery'],
    description:
      'Every graph pattern worth knowing: traversals, topological sort, '
      + 'shortest paths, union-find and MST.',
    sections: [
      {
        title: 'BFS / DFS on Grids',
        problems: [
          'lc:number-of-islands', 'lc:rotting-oranges', 'lc:surrounded-regions',
          'lc:pacific-atlantic-water-flow', 'lc:01-matrix',
        ],
      },
      {
        title: 'Graph Traversal',
        problems: [
          'lc:clone-graph', 'lc:number-of-provinces', 'lc:all-paths-from-source-to-target',
          'lc:is-graph-bipartite',
        ],
      },
      {
        title: 'Topological Sort',
        problems: [
          'lc:course-schedule', 'lc:course-schedule-ii', 'lc:find-eventual-safe-states',
          'lc:alien-dictionary',
        ],
      },
      {
        title: 'Shortest Path',
        problems: [
          'lc:network-delay-time', 'lc:cheapest-flights-within-k-stops',
          'lc:path-with-minimum-effort', 'lc:word-ladder',
        ],
      },
      {
        title: 'Union Find & MST',
        problems: [
          'lc:redundant-connection', 'lc:min-cost-to-connect-all-points',
          'lc:graph-valid-tree', 'lc:number-of-connected-components-in-an-undirected-graph',
        ],
      },
    ],
  },

  {
    slug: 'cp-31',
    title: 'CP-31',
    curator: 'Competitive Programming',
    category: 'cp',
    icon: 'CP',
    tags: ['competitive-programming', 'codeforces', 'ladder'],
    description:
      'A Codeforces ladder that ramps from 800 to 1600 rated. Work top to '
      + 'bottom; each band should start to feel easy before you move on.',
    sections: [
      {
        title: 'Rating 800',
        problems: [
          'cf:4/A', 'cf:71/A', 'cf:231/A', 'cf:282/A', 'cf:263/A',
          'cf:339/A', 'cf:112/A', 'cf:50/A',
        ],
      },
      {
        title: 'Rating 900 - 1000',
        problems: ['cf:158/A', 'cf:118/A', 'cf:96/A', 'cf:469/A', 'cf:122/A'],
      },
      {
        title: 'Rating 1100 - 1200',
        problems: ['cf:1/A', 'cf:148/A', 'cf:456/A', 'cf:546/A', 'cf:158/B'],
      },
      {
        title: 'Rating 1300 - 1400',
        problems: ['cf:550/A', 'cf:522/A', 'cf:469/B', 'cf:705/A', 'cf:580/C'],
      },
      {
        title: 'Rating 1500 - 1600',
        problems: ['cf:1000/B', 'cf:1092/C', 'cf:616/C', 'cf:977/D'],
      },
    ],
  },

  {
    slug: 'quick-revision',
    title: 'Quick Revision',
    curator: 'CodeOvertake',
    category: 'quick-revision',
    icon: 'QR',
    tags: ['revision', 'last-minute'],
    description:
      'High-impact problems for the night before an interview. One representative '
      + 'question per major pattern.',
    sections: [
      {
        title: 'Arrays & Strings',
        problems: [
          'lc:two-sum', 'lc:maximum-subarray', 'lc:product-of-array-except-self',
          'lc:longest-substring-without-repeating-characters', 'lc:group-anagrams',
        ],
      },
      {
        title: 'Linked Lists & Stacks',
        problems: ['lc:reverse-linked-list', 'lc:linked-list-cycle', 'lc:valid-parentheses'],
      },
      {
        title: 'Trees & Graphs',
        problems: [
          'lc:binary-tree-level-order-traversal', 'lc:validate-binary-search-tree',
          'lc:number-of-islands', 'lc:course-schedule',
        ],
      },
      {
        title: 'DP & Greedy',
        problems: ['lc:climbing-stairs', 'lc:coin-change', 'lc:jump-game', 'lc:merge-intervals'],
      },
      {
        title: 'Search & Sort',
        problems: [
          'lc:search-in-rotated-sorted-array', 'lc:kth-largest-element-in-an-array',
          'lc:top-k-frequent-elements',
        ],
      },
    ],
  },

  {
    slug: 'gfg-must-do',
    title: 'GfG Interview Essentials',
    curator: 'GeeksforGeeks',
    category: 'popular',
    icon: 'GfG',
    tags: ['geeksforgeeks', 'interview', 'india'],
    description:
      'Frequently asked GeeksforGeeks practice problems, the staple of Indian '
      + 'placement preparation.',
    sections: [
      {
        title: 'Arrays',
        problems: [
          'gfg:kadanes-algorithm-1587115620',
          'gfg:subarray-with-given-sum-1587115621',
          'gfg:missing-number-in-array1416',
          'gfg:leaders-in-an-array-1587115620',
          'gfg:sort-an-array-of-0s-1s-and-2s4231',
          'gfg:minimum-element-in-a-sorted-and-rotated-array3611',
        ],
      },
      {
        title: 'Strings',
        problems: [
          'gfg:reverse-words-in-a-given-string5459',
          'gfg:anagram-1587115620',
          'gfg:longest-distinct-characters-in-string5848',
        ],
      },
      {
        title: 'Linked List',
        problems: [
          'gfg:reverse-a-linked-list',
          'gfg:detect-loop-in-linked-list',
          'gfg:merge-two-sorted-linked-lists',
        ],
      },
    ],
  },
];
