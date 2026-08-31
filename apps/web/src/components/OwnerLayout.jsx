import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout as AntLayout, Dropdown, Grid, Typography } from "antd";
import {
  HomeOutlined,
  HistoryOutlined,
  EnvironmentOutlined,
  UserOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/authStore";

const { Content } = AntLayout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

const NAV_ITEMS = [
  { key: "/home", label: "Home", icon: <HomeOutlined /> },
  { key: "/history", label: "Results", icon: <HistoryOutlined /> },
  { key: "/map", label: "Map", icon: <EnvironmentOutlined /> },
];

// Record-level pages shared with the clinic shell highlight the nav entry
// they were most likely reached from.
const pathToNavKey = (pathname) => {
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
  const isMobile = !screens.md;

  if (!user) return null;

  const activeKey = pathToNavKey(location.pathname);

  const userMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Log out",
      onClick: () => {
        logout();
        navigate("/login");
      },
    },
  ];

  return (
    <AntLayout style={{ minHeight: "100vh", background: "var(--shell-bg)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile ? "14px 16px" : "16px 24px",
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Link
          to="/home"
          style={{
            fontFamily: "var(--heading-font)",
            fontWeight: 700,
            fontSize: 20,
            color: "var(--ink-strong)",
            textDecoration: "none",
          }}
        >
          LFA Reader
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {!isMobile &&
            NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                to={item.key}
                style={{
                  color:
                    activeKey === item.key
                      ? "var(--ink-strong)"
                      : "var(--ink-secondary)",
                  fontWeight: activeKey === item.key ? 700 : 500,
                  fontSize: 14,
                }}
              >
                {item.label}
              </Link>
            ))}
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                color: "var(--ink-secondary)",
              }}
            >
              <UserOutlined />
              {!isMobile && (
                <Text style={{ color: "var(--ink-secondary)", fontSize: 13.5 }}>
                  {user.username}
                </Text>
              )}
            </div>
          </Dropdown>
        </div>
      </div>

      <Content
        style={{
          padding: isMobile ? "0 16px 90px" : "0 24px 48px",
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {children}
      </Content>

      {isMobile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderTop: "1px solid var(--surface-border)",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            padding: "8px 0 12px",
            zIndex: 100,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = activeKey === item.key;
            return (
              <Link
                key={item.key}
                to={item.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  color: active
                    ? "var(--brand-primary)"
                    : "var(--ink-secondary)",
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </AntLayout>
  );
}
