import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { Flavor } from "../util";
import { isUserInTeam } from "./accounts";

export type LocationID = Flavor<string, "LocationID">;

export interface ILocation {
  _id: LocationID;
  slug: string;
  name: string;
  teamName: string;
  curfew?: boolean;
  closed?: boolean;
}

const Locations = new Mongo.Collection<ILocation>("locations");

if (Meteor.isServer) {
  Meteor.startup(() => {
    if (Locations.find().count() === 0) {
      Locations.insert({ slug: "bar", name: "WIP Bar", teamName: "Bar" });
      Locations.insert({ slug: "info", name: "Infodesk", teamName: "Info" });
    }
  });
}
export default Locations;

export const locationMethods = {
  "Locations.toggleCurfew"(
    this: Meteor.MethodThisType,
    { locationId }: { locationId: LocationID },
  ) {
    const location = Locations.findOne(locationId);

    if (!isUserInTeam(this.userId, location?.teamName)) {
      throw new Meteor.Error("Wait that's illegal");
    }

    return (
      Locations.update(locationId, {
        $set: { curfew: !location?.curfew, updatedAt: new Date() },
      }) && Locations.findOne(locationId)
    );
  },
  "Locations.toggleClosed"(
    this: Meteor.MethodThisType,
    { locationId }: { locationId: LocationID },
  ) {
    const location = Locations.findOne(locationId);

    if (!isUserInTeam(this.userId, location?.teamName)) {
      throw new Meteor.Error("Wait that's illegal");
    }

    return (
      Locations.update(locationId, {
        $set: { closed: !location?.closed, updatedAt: new Date() },
      }) && Locations.findOne(locationId)
    );
  },
} as const;

Meteor.methods(locationMethods);

// @ts-expect-error
if (Meteor.isClient) window.Locations = Locations;
