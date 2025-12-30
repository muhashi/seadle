import { useMemo } from "react";

const Compass = ({ bearing }) => {
  const range = 45;

  // Stable random offset per bearing
  const centerRotation = useMemo(() => {
    const offset = (Math.random() * 2 - 1) * range;
    return bearing + offset;
  }, [bearing]);

  return (
    <div
      style={{
        position: "relative",
        width: "3rem",
        height: "3rem",
        borderRadius: "50%",
        border: "2px solid #ccc",
        background: "#111",
        color: "#fff",
        fontWeight: 600,
        userSelect: "none"
      }}
    >
      {["N", "E", "S", "W"].map((dir) => (
        <div
          key={dir}
          style={{
            position: "absolute",
            fontSize: "0.5rem",
            ...(dir === "N" && { top: 1, left: "50%", transform: "translateX(-50%)" }),
            ...(dir === "E" && { right: 2, top: "50%", transform: "translateY(-50%)" }),
            ...(dir === "S" && { bottom: 1, left: "50%", transform: "translateX(-50%)" }),
            ...(dir === "W" && { left: 2, top: "50%", transform: "translateY(-50%)" })
          }}
        >
          {dir}
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `rotate(${centerRotation}deg)`
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 3,
            height: 18,
            background: "red",
            borderRadius: 2,
            transformOrigin: "50% 100%",
            transform: "translate(-50%, -100%)",
            animation: `compass-sway 2.5s ease-in-out infinite alternate`
          }}
        />
      </div>

      <style>
        {`
          @keyframes compass-sway {
            from { transform: translate(-50%, -100%) rotate(${-range}deg); }
            to   { transform: translate(-50%, -100%) rotate(${range}deg); }
          }
        `}
      </style>
    </div>
  );
};

export default Compass;
