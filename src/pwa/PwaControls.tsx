import { useState, useSyncExternalStore } from "react";
import { Download, RefreshCw, WifiOff, Check } from "lucide-react";
import { applyPwaUpdate, getPwaState, installPwa, subscribePwa } from "./register";
import "./pwa.css";

interface Props {
  canUpdate?: boolean;
  beforeUpdate?: () => boolean | Promise<boolean>;
}

export function PwaControls({ canUpdate = true, beforeUpdate }: Props) {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getPwaState);
  const [working, setWorking] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [error, setError] = useState("");
  if (!pwa.supported) return null;

  async function update() {
    setWorking(true);
    setError("");
    try {
      if (beforeUpdate && !await beforeUpdate()) {
        setError("存档未完成，请稍后更新。");
        return;
      }
      await applyPwaUpdate();
    } catch {
      setError("更新失败，请稍后重试。");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="pwa-controls" aria-label="安装与离线使用">
      <span className="pwa-status" role="status">
        {!pwa.online ? <WifiOff size={14} /> : pwa.offlineReady ? <Check size={14} /> : null}
        {pwa.offlineReady ? (!pwa.online ? "离线运行" : "可离线使用") : "准备离线文件…"}
        {pwa.installed && " · 已安装"}
      </span>
      {!pwa.installed && (
        <button
          className="pwa-button"
          disabled={!pwa.offlineReady || working}
          onClick={async () => {
            if (!pwa.installAvailable) {
              setInstructions((visible) => !visible);
              return;
            }
            setWorking(true);
            await installPwa();
            setWorking(false);
          }}
        >
          <Download size={15} />安装游戏
        </button>
      )}
      {pwa.needRefresh && (
        <button className="pwa-button" disabled={!canUpdate || working} onClick={update}>
          <RefreshCw size={15} />更新并重启
        </button>
      )}
      {instructions && !pwa.installed && (
        <p className="pwa-message">浏览器菜单 → 安装应用。iPhone / iPad：分享 → 添加到主屏幕。</p>
      )}
      {(error || pwa.error) && <p className="pwa-message" role="alert">{error || pwa.error}</p>}
    </div>
  );
}
