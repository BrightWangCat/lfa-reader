import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout as AntLayout, Menu, Grid, Button, Drawer, Typography } from "antd";
import {
  AppstoreOutlined,
  InboxOutlined,
  BarChartOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  LogoutOutlined,
  MenuOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/authStore";
import { getRoleDisplay, ADMIN_ROLE, normalizeRole } from "../pages/userRoles";

const { Content, Sider } = AntLayout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const SIDER_BG = "#16283A";

const pathToKey = (pathname) => {
  if (pathname.startsWith("/clinic/submissions") || pathname.startsWith("/results")) {
    return "/clinic/submissions";
  }
  if (pathname.startsWith("/clinic/statistics")) return "/clinic/statistics";
  if (pathname.startsWith("/clinic/map")) return "/clinic/map";
  if (pathname.startsWith("/clinic/users")) return "/clinic/users";
  return "/clinic";
};

export default function ClinicLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = !screens.lg;

  if (!user) return null;

  const isAdmin = normalizeRole(user.role) === ADMIN_ROLE;
  const roleLabel = getRoleDisplay(user.role).label;
  const selectedKey = pathToKey(location.pathname);

  const menuItems = [
    { key: "/clinic", icon: <AppstoreOutlined />, label: "Dashboard" },
    { key: "/clinic/submissions", icon: <InboxOutlined />, label: "Submissions" },
    { key: "/clinic/statistics", icon: <BarChartOutlined />, label: "Statistics" },
    { key: "/clinic/map", icon: <EnvironmentOutlined />, label: "Community Map" },
    ...(isAdmin
      ? [{ key: "/clinic/users", icon: <TeamOutlined />, label: "Users" }]
      : []),
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "18px 16px 14px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--heading-font)",
          fontWeight: 700,
          fontSize: 17,
          color: "#ffffff",
        }}
      >
        LFA Reader
      </span>
      <span
        style={{
          background: "#24425F",
          color: "#9FC1E8",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          borderRadius: 5,
          padding: "3px 6px",
        }}
      >
        CLINIC
      </span>
    </div>
  );

  const userBlock = (
    <div
      style={{
        margin: 12,
        padding: "11px 12px",
        borderRadius: 10,
        background: "#1F3A54",
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
          background: "#24425F",
          color: "#9FC1E8",
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
            color: "#ffffff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.username}
        </div>
        <div style={{ fontSize: 11.5, color: "#8FA5B8" }}>{roleLabel}</div>
      </div>
      <Button
        type="text"
        size="small"
        icon={<LogoutOutlined style={{ color: "#8FA5B8" }} />}
        onClick={handleLogout}
        title="Log out"
      />
    </div>
  );

  const navMenu = (
    <Menu
      mode="inline"
      theme="dark"
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
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
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
            }}
          >
            <Button
              type="text"
              icon={<MenuOutlined style={{ color: "#fff", fontSize: 18 }} />}
              onClick={() => setDrawerOpen(true)}
            />
            <Link
              to="/clinic"
              style={{
                fontFamily: "var(--heading-font)",
                fontWeight: 700,
                fontSize: 17,
                color: "#ffffff",
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
            maxWidth: 1240,
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
          body: { padding: 0, background: SIDER_BG, display: "flex", flexDirection: "column" },
          header: { display: "none" },
        }}
      >
        {brandBlock}
        {navMenu}
        {userBlock}
        <div style={{ padding: "0 16px 16px" }}>
          <Text style={{ color: "#8FA5B8", fontSize: 12 }}>
            Signed in as {user.username}
          </Text>
        </div>
      </Drawer>
    </AntLayout>
  );
}
