declare type FeaturesLocalization = {
  [key: string]: {
    [languageCode: string]: string;
    context: string?; //The context of the feature
  };
};

declare type GameContext = {
  description: string;
  features: FeaturesLocalization; //Used to know how to translate the features
};
