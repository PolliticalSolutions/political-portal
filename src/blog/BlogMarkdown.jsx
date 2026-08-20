import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const HEADING_ONE_PATTERN = /^\s{0,3}#\s+\S/m;

const DemotedHeading = ({ level, children }) => {
  const Tag = `h${Math.min(level + 1, 6)}`;
  return <Tag>{children}</Tag>;
};

const createHeadingComponents = (content) => {
  if (!HEADING_ONE_PATTERN.test(content)) {
    return {};
  }

  return {
    h1: ({ children }) => <DemotedHeading level={1}>{children}</DemotedHeading>,
    h2: ({ children }) => <DemotedHeading level={2}>{children}</DemotedHeading>,
    h3: ({ children }) => <DemotedHeading level={3}>{children}</DemotedHeading>,
    h4: ({ children }) => <DemotedHeading level={4}>{children}</DemotedHeading>,
    h5: ({ children }) => <DemotedHeading level={5}>{children}</DemotedHeading>,
  };
};

export default function BlogMarkdown({ content }) {
  const components = {
    ...createHeadingComponents(content),
    img: ({ node: _node, ...props }) => (
      <img {...props} loading="lazy" decoding="async" />
    ),
    table: ({ node: _node, ...props }) => (
      <div
        className="blog-markdown__table-wrap"
        role="region"
        aria-label="Scrollable article table"
        tabIndex="0"
      >
        <table {...props} />
      </div>
    ),
  };

  return (
    <div className="blog-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
