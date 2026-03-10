import { Layout as AntLayout, Grid } from "antd";
import Navbar from "./Navbar";

const { Content } = AntLayout;
const { useBreakpoint } = Grid;

export default function Layout({ children }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Navbar />
      <Content
        style={{
          padding: isMobile ? "1rem" : "2rem",
          maxWidth: 1200,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {children}
      </Content>
    </AntLayout>
  );
}
