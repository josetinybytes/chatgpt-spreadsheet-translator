declare type FeaturesLocalization = {
  [key: string]: {
    [languageCode: string]: string;
  };
};

declare type GameContext = {
  description: string;
  features: FeaturesLocalization; //Used to know how to translate the features
};
