import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout as AntLayout, Menu, Grid, Button, Drawer, Typography } from "antd";
import {
  HomeOutlined,
  HistoryOutlined,
  EnvironmentOutlined,
  LogoutOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/authStore";

const { Content, Sider } = AntLayout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// Same sidebar structure as the clinic shell, in the warm owner palette:
// a light sand panel instead of the clinic's dark slate.
const SIDER_BG = "#F5EDE3";

const pathToKey = (pathname) => {
  if (pathname.startsWith("/history") || pathname.startsWith("/results")) {
    return "/history";
  }
  if (pathname.startsWith("/map")) return "/map";
  return "/home";
};

export default function OwnerLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = !screens.lg;

  if (!user) return null;

  const selectedKey = pathToKey(location.pathname);

  const menuItems = [
    { key: "/home", icon: <HomeOutlined />, label: "Home" },
    { key: "/history", icon: <HistoryOutlined />, label: "My Results" },
    { key: "/map", icon: <EnvironmentOutlined />, label: "Community Map" },
  ];

  const handleMenuClick = ({ key }) => {
    setDrawerOpen(false);
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const brandBlock = (
    <div style={{ padding: "18px 16px 14px" }}>
      <Link
        to="/home"
        style={{
          fontFamily: "var(--heading-font)",
          fontWeight: 700,
          fontSize: 19,
          color: "var(--ink-strong)",
          textDecoration: "none",
        }}
      >
        LFA Reader
      </Link>
    </div>
  );

  const userBlock = (
    <div
      style={{
        margin: 12,
        padding: "11px 12px",
        borderRadius: 12,
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          background: "#E9DCCB",
          color: "#6E5A41",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {user.username.slice(0, 2).toUpperCase()}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink-strong)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.username}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-secondary)" }}>
          Pet Owner
        </div>
      </div>
      <Button
        type="text"
        size="small"
        icon={<LogoutOutlined style={{ color: "var(--ink-secondary)" }} />}
        onClick={handleLogout}
        title="Log out"
      />
    </div>
  );

  const navMenu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={handleMenuClick}
      style={{ background: "transparent", borderRight: "none", flex: 1 }}
    />
  );

  return (
    <AntLayout style={{ minHeight: "100vh", background: "var(--shell-bg)" }}>
      {!isMobile && (
        <Sider
          width={224}
          style={{
            background: SIDER_BG,
            borderRight: "1px solid var(--surface-border)",
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {brandBlock}
            {navMenu}
            {userBlock}
          </div>
        </Sider>
      )}

      <AntLayout style={{ background: "var(--shell-bg)" }}>
        {isMobile && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              background: SIDER_BG,
              borderBottom: "1px solid var(--surface-border)",
            }}
          >
            <Button
              type="text"
              icon={
                <MenuOutlined
                  style={{ color: "var(--ink-strong)", fontSize: 18 }}
                />
              }
              onClick={() => setDrawerOpen(true)}
            />
            <Link
              to="/home"
              style={{
                fontFamily: "var(--heading-font)",
                fontWeight: 700,
                fontSize: 17,
                color: "var(--ink-strong)",
              }}
            >
              LFA Reader
            </Link>
          </div>
        )}

        <Content
          style={{
            padding: isMobile ? 16 : "24px 28px",
            width: "100%",
            maxWidth: 920,
            margin: "0 auto",
          }}
        >
          {children}
        </Content>
      </AntLayout>

      <Drawer
        placement="left"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={260}
        styles={{
          body: {
            padding: 0,
            background: SIDER_BG,
            display: "flex",
            flexDirection: "column",
          },
          header: { display: "none" },
        }}
      >
        {brandBlock}
        {navMenu}
        {userBlock}
        <div style={{ padding: "0 16px 16px" }}>
          <Text style={{ color: "var(--ink-secondary)", fontSize: 12 }}>
            Signed in as {user.username}
          </Text>
        </div>
      </Drawer>
    </AntLayout>
  );
}
