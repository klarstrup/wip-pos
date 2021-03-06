import { addHours, endOfHour, isWithinRange } from "date-fns";
import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Camps from "../api/camps";
import Sales from "../api/sales";
import useCurrentLocation from "../hooks/useCurrentLocation";
import useMongoFetch from "../hooks/useMongoFetch";

export default function CampByCamp() {
  const { data: camps, loading: campsLoading } = useMongoFetch(Camps, []);
  const { location } = useCurrentLocation();
  const { data: sales, loading: salesLoading } = useMongoFetch(
    Sales.find({ locationId: location?._id }),
    [location],
  );
  const longestCamp = camps.reduce((memo, camp) => {
    if (!memo) {
      memo = camp;
    } else {
      if (camp.end - camp.start > memo.end - memo.start) memo = camp;
    }
    return memo;
  }, null);
  const longestCampHours = longestCamp
    ? Math.ceil((longestCamp.end - longestCamp.start) / (3600 * 1000))
    : null;

  const [data, campTotals] = useMemo(() => {
    const data = [];
    let campTotals = {};
    for (let i = 0; i < longestCampHours; i++) {
      const datapoint = { hour: i };
      camps.forEach((camp) => {
        const count = sales
          .filter((sale) =>
            isWithinRange(
              sale.timestamp,
              addHours(camp.start, i),
              endOfHour(addHours(camp.start, i)),
            ),
          )
          .reduce((memo, sale) => memo + Number(sale.amount), 0);
        if (count) {
          campTotals[camp.slug] = (campTotals[camp.slug] || 0) + count;
          datapoint[camp.slug] = campTotals[camp.slug];
        }
      });
      data.push(datapoint);
    }
    return [data, campTotals];
  }, [camps, longestCampHours, sales]);
  if (campsLoading || salesLoading) return "Loading...";
  console.log(data);
  return (
    <ResponsiveContainer width={900} height={350}>
      <LineChart data={data} margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="hour"
          interval={5}
          tickFormatter={(hour) =>
            String(((hour + 1 + 2) % 24) - 1).padStart(2, "0")
          }
        />
        <YAxis
          domain={["dataMin", "dataMax"]}
          label={{
            value: "Revenue (HAX)",
            angle: -90,
            offset: 70,
            position: "insideLeft",
            style: { fill: "yellow" },
          }}
        />
        <Tooltip
          labelFormatter={(hour) =>
            `H${String(((hour + 1 + 2) % 24) - 1).padStart(2, "0")}D${String(
              Math.ceil(hour / 24),
            ).padStart(2, "0")}`
          }
          wrapperStyle={{ background: "black" }}
        />
        <Legend />
        <ReferenceLine
          y={campTotals["bornhack-2019"]}
          label={{
            value: "Max 2019",
            position: "insideTop",
            style: { fill: "#FFED00" },
          }}
          stroke="#FFED00"
          strokeDasharray="3 3"
        />
        <Line
          type="monotone"
          dataKey="bornhack-2019"
          stroke="#FFED00"
          strokeWidth={4}
          strokeDasharray="3 3"
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="bornhack-2020"
          stroke="#FD8B25"
          strokeWidth={4}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
