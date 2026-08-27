/**
 * Compact problem references used by the seed data.
 *
 * Writing full URLs for ~250 problems would be unreadable, so seed files use
 * short refs that expand to canonical URLs:
 *
 *   lc:two-sum        -> https://leetcode.com/problems/two-sum/
 *   cf:4/A            -> https://codeforces.com/problemset/problem/4/A
 *   gfg:kadanes-...   -> https://www.geeksforgeeks.org/problems/kadanes-.../1
 *   cc:FLOW001        -> https://www.codechef.com/problems/FLOW001
 */

function expandRef(ref) {
  const value = String(ref || '').trim();
  const colon = value.indexOf(':');
  if (colon === -1) return value; // already a URL

  const prefix = value.slice(0, colon);
  const rest = value.slice(colon + 1);

  switch (prefix) {
    case 'lc':
      return `https://leetcode.com/problems/${rest}/`;
    case 'cf': {
      const [contestId, index] = rest.split('/');
      return `https://codeforces.com/problemset/problem/${contestId}/${index}`;
    }
    case 'gfg':
      return `https://www.geeksforgeeks.org/problems/${rest}/1`;
    case 'cc':
      return `https://www.codechef.com/problems/${rest}`;
    case 'https':
    case 'http':
      return value;
    default:
      return value;
  }
}

function expandRefs(refs = []) {
  return refs.map(expandRef);
}

module.exports = { expandRef, expandRefs };
