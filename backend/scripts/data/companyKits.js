/**
 * Curated company interview kits.
 *
 * Each company maps recency buckets to problem refs. The seeder tags the shared
 * Problem catalog, and companyService then serves the three preparation modes
 * Codolio offers (All-Time / Last 6 Months / Last 45 Days).
 *
 * `all-time` entries are the historically repeated classics; the shorter windows
 * are the more recently reported questions. GeeksforGeeks problems additionally
 * contribute their own company tags automatically at resolve time, so real
 * deployments end up with far more coverage than this seed alone.
 */

module.exports = [
  {
    name: 'Google',
    buckets: {
      'all-time': [
        'lc:two-sum', 'lc:longest-substring-without-repeating-characters',
        'lc:merge-intervals', 'lc:word-search-ii', 'lc:number-of-islands',
        'lc:trapping-rain-water', 'lc:median-of-two-sorted-arrays',
        'lc:longest-increasing-path-in-a-matrix', 'lc:decode-string',
      ],
      '6-months': [
        'lc:minimum-window-substring', 'lc:course-schedule-ii',
        'lc:find-median-from-data-stream', 'lc:maximum-subarray',
      ],
      '45-days': ['lc:merge-intervals', 'lc:number-of-islands', 'lc:coin-change'],
    },
  },
  {
    name: 'Amazon',
    buckets: {
      'all-time': [
        'lc:two-sum', 'lc:lru-cache', 'lc:number-of-islands',
        'lc:merge-k-sorted-lists', 'lc:copy-list-with-random-pointer',
        'lc:word-ladder', 'lc:top-k-frequent-elements', 'lc:reorder-data-in-log-files',
        'lc:trapping-rain-water',
      ],
      '6-months': [
        'lc:group-anagrams', 'lc:rotting-oranges', 'lc:k-closest-points-to-origin',
        'lc:course-schedule',
      ],
      '45-days': ['lc:lru-cache', 'lc:rotting-oranges', 'lc:valid-parentheses'],
    },
  },
  {
    name: 'Microsoft',
    buckets: {
      'all-time': [
        'lc:reverse-linked-list', 'lc:valid-parentheses', 'lc:lru-cache',
        'lc:spiral-matrix', 'lc:merge-intervals', 'lc:string-to-integer-atoi',
        'lc:serialize-and-deserialize-binary-tree', 'lc:linked-list-cycle',
      ],
      '6-months': [
        'lc:add-two-numbers', 'lc:binary-tree-level-order-traversal',
        'lc:validate-binary-search-tree',
      ],
      '45-days': ['lc:reverse-linked-list', 'lc:spiral-matrix'],
    },
  },
  {
    name: 'Meta',
    buckets: {
      'all-time': [
        'lc:valid-palindrome', 'lc:minimum-remove-to-make-valid-parentheses',
        'lc:merge-intervals', 'lc:k-closest-points-to-origin',
        'lc:binary-tree-right-side-view', 'lc:subarray-sum-equals-k',
        'lc:product-of-array-except-self',
        'lc:lowest-common-ancestor-of-a-binary-tree',
      ],
      '6-months': [
        'lc:valid-word-abbreviation', 'lc:random-pick-with-weight',
        'lc:diameter-of-binary-tree',
      ],
      '45-days': ['lc:valid-palindrome', 'lc:subarray-sum-equals-k'],
    },
  },
  {
    name: 'Apple',
    buckets: {
      'all-time': [
        'lc:two-sum', 'lc:merge-two-sorted-lists', 'lc:lru-cache',
        'lc:trapping-rain-water', 'lc:longest-palindromic-substring',
        'lc:maximum-subarray',
      ],
      '6-months': ['lc:group-anagrams', 'lc:valid-parentheses'],
      '45-days': ['lc:two-sum'],
    },
  },
  {
    name: 'Uber',
    buckets: {
      'all-time': [
        'lc:lru-cache', 'lc:merge-intervals', 'lc:word-search',
        'lc:group-anagrams', 'lc:evaluate-division', 'lc:meeting-rooms-ii',
      ],
      '6-months': ['lc:course-schedule', 'lc:number-of-islands'],
      '45-days': ['lc:meeting-rooms-ii'],
    },
  },
  {
    name: 'Atlassian',
    buckets: {
      'all-time': [
        'lc:merge-intervals', 'lc:meeting-rooms-ii', 'lc:lru-cache',
        'lc:design-hit-counter', 'lc:insert-delete-getrandom-o1',
      ],
      '6-months': ['lc:top-k-frequent-elements', 'lc:valid-parentheses'],
      '45-days': ['lc:merge-intervals'],
    },
  },
  {
    name: 'Adobe',
    buckets: {
      'all-time': [
        'lc:two-sum', 'lc:maximum-subarray', 'lc:merge-intervals',
        'lc:spiral-matrix', 'lc:rotate-image',
      ],
      '6-months': ['lc:coin-change', 'lc:climbing-stairs'],
      '45-days': ['lc:maximum-subarray'],
    },
  },
  {
    name: 'Flipkart',
    buckets: {
      'all-time': [
        'lc:lru-cache', 'lc:trapping-rain-water', 'lc:number-of-islands',
        'lc:median-of-two-sorted-arrays', 'lc:merge-intervals',
      ],
      '6-months': ['lc:coin-change', 'lc:word-break'],
      '45-days': ['lc:lru-cache'],
    },
  },
  {
    name: 'Salesforce',
    buckets: {
      'all-time': [
        'lc:two-sum', 'lc:valid-parentheses', 'lc:merge-intervals',
        'lc:longest-common-prefix',
      ],
      '6-months': ['lc:group-anagrams'],
      '45-days': ['lc:two-sum'],
    },
  },
];
