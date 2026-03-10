import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Dropdown, Typography, Grid, Button, Drawer } from "antd";
import {
  PlusCircleOutlined,
  HistoryOutlined,
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";

const { Header } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// Map pathname to menu key
const pathToKey = {
  "/upload": "upload",
  "/history": "history",
  "/results": "results",
  "/stats": "stats",
  "/users": "users",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!user) return null;

  const isMobile = !screens.md;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Determine active menu key from current path
  const currentKey = pathToKey[location.pathname] || "";

  const menuItems = [
    {
      key: "upload",
      icon: <PlusCircleOutlined />,
      label: <Link to="/upload" onClick={() => setDrawerOpen(false)}>New Test</Link>,
    },
    {
      key: "history",
      icon: <HistoryOutlined />,
      label: <Link to="/history" onClick={() => setDrawerOpen(false)}>Results</Link>,
    },
    ...(user.role === "admin"
      ? [
          {
            key: "users",
            icon: <TeamOutlined />,
            label: <Link to="/users" onClick={() => setDrawerOpen(false)}>Users</Link>,
          },
        ]
      : []),
  ];

  const userMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Log out",
      onClick: handleLogout,
    },
  ];

  return (
    <>
      <Header
        style={{
          background: "#1a365d",
          display: "flex",
          alignItems: "center",
          padding: isMobile ? "0 12px" : "0 24px",
          height: 56,
          lineHeight: "56px",
        }}
      >
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined style={{ color: "#fff", fontSize: 18 }} />}
            onClick={() => setDrawerOpen(true)}
            style={{ marginRight: 8 }}
          />
        )}

        <Link
          to="/upload"
          style={{
            color: "#fff",
            fontSize: isMobile ? "0.95rem" : "1.125rem",
            fontWeight: 700,
            marginRight: isMobile ? "auto" : 40,
            whiteSpace: "nowrap",
            textDecoration: "none",
          }}
        >
          {isMobile ? "LFA Reader" : "FeLV/FIV LFA Reader"}
        </Link>

        {!isMobile && (
          <Menu
            mode="horizontal"
            selectedKeys={[currentKey]}
            items={menuItems}
            style={{
              background: "transparent",
              borderBottom: "none",
              flex: 1,
              minWidth: 0,
              lineHeight: "56px",
            }}
            theme="dark"
          />
        )}

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              color: "#bee3f8",
              whiteSpace: "nowrap",
            }}
          >
            <UserOutlined />
            {!isMobile && (
              <Text style={{ color: "#bee3f8", fontSize: "0.875rem" }}>
                {user.username}
              </Text>
            )}
          </div>
        </Dropdown>
      </Header>

      <Drawer
        title="Menu"
        placement="left"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        width={260}
        styles={{ body: { padding: 0 } }}
      >
        <Menu
          mode="inline"
          selectedKeys={[currentKey]}
          items={menuItems}
          style={{ borderRight: "none" }}
        />
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f0f0f0" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Signed in as <Text strong>{user.username}</Text>
          </Text>
        </div>
      </Drawer>
    </>
  );
}
