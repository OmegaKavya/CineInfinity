import './FranchiseGraph.css';

// Drawing units, in pixels. The diagram scrolls sideways rather than scaling,
// so these set the real size.
const COL_W = 210;
const ROW_H = 92;
const NODE_W = 170;
const NODE_H = 62;

/**
 * A franchise as a dependency graph: columns by how much must be watched
 * first, edges by relation. Shared by the How page and the watch-order panel.
 * `onSelect`, when given, makes each entry open that franchise.
 */
export default function FranchiseGraph({ drawn, onSelect }) {
  const width = drawn.columns * COL_W + 40;
  const height = drawn.rows * ROW_H + 40;

  const x = (n) => n.column * COL_W + 20;
  const y = (n) => n.offset * ROW_H + 20;

  return (
    <div className="fgraph__graph" role="img"
         aria-label={`Dependency graph of ${drawn.nodes.length} entries in ${drawn.columns} columns`}>
      {/* Sized in pixels, not scaled to the container. Scaled, a thirteen
          column graph was squeezed into the text width and every label went
          to a grey smear. It scrolls sideways instead, which is the right
          trade for a diagram whose labels are the content. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        preserveAspectRatio="xMinYMin meet"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {drawn.edges.map((edge, i) => {
          const x1 = x(edge.source) + NODE_W;
          const y1 = y(edge.source) + NODE_H / 2;
          const x2 = x(edge.target);
          const y2 = y(edge.target) + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          return (
            <g key={i} className={`fgraph__edge is-${(edge.type || '').toLowerCase()}`}>
              <path
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}

        {drawn.nodes.map((node) => (
          <g key={node.id} className={`fgraph__node is-${node.kind || 'main'}${onSelect ? ' is-link' : ''}`}
             transform={`translate(${x(node)} ${y(node)})`}
             {...(onSelect ? {
               role: 'link', tabIndex: 0,
               onClick: () => onSelect(node),
               onKeyDown: (e) => { if (e.key === 'Enter') onSelect(node); },
             } : {})}>
            <title>{`${node.title}${node.startDate?.year ? ` (${node.startDate.year})` : ''}`}</title>
            <rect width={NODE_W} height={NODE_H} rx="8" />
            <text className="fgraph__node-title" x="10" y="24">
              {truncate(node.title, 22)}
            </text>
            <text className="fgraph__node-year" x="10" y="45">
              {node.startDate?.year || 'year unknown'}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
