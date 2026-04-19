import { useNavigate } from "react-router-dom";
import { Typography, Card, Row, Col, Tag } from "antd";
import diseases from "@shared/data/diseases.json";

const { Title, Text } = Typography;

// Order categories to match the product flowchart (Infectious first, then Cancer).
const CATEGORY_ORDER = ["Infectious", "Cancer"];

const SPECIES_LABEL = { cat: "Cats", dog: "Dogs" };

export default function Home() {
  const navigate = useNavigate();

  // Group the three workflows under their category for two stacked sections.
  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: diseases.filter((d) => d.category === category),
  }));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <Title level={3} style={{ color: "#1a365d", marginBottom: 8 }}>
        Start a New Test
      </Title>
      <Text
        type="secondary"
        style={{ display: "block", marginBottom: 32, lineHeight: 1.6 }}
      >
        Choose the disease workflow that matches the lateral flow assay you are
        about to read. Each workflow collects the clinical context specific to
        that disease.
      </Text>

      {grouped.map(({ category, items }) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <Title level={4} style={{ color: "#2d3748", marginBottom: 16 }}>
            {category}
          </Title>
          <Row gutter={[16, 16]}>
            {items.map((disease) => (
              <Col xs={24} sm={12} md={8} key={disease.id}>
                <Card
                  hoverable
                  onClick={() =>
                    navigate(`/upload?disease=${encodeURIComponent(disease.id)}`)
                  }
                  styles={{ body: { padding: 20 } }}
                  style={{ height: "100%" }}
                >
                  <Title level={5} style={{ color: "#1a365d", margin: 0 }}>
                    {disease.label}
                  </Title>
                  <div style={{ marginTop: 12 }}>
                    <Tag color={disease.species === "cat" ? "magenta" : "blue"}>
                      {SPECIES_LABEL[disease.species]}
                    </Tag>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </div>
  );
}
