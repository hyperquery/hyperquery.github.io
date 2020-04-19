import React, { Component } from "react";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link
} from "react-router-dom";
import { DebounceInput } from "react-debounce-input";
import innerText from "react-innertext";
import split from "split-string";
import qs from "qs";

import "./App.scss";

const data = require("./data.json");

class App extends Component {
  render() {
    return (
      <Router>
        <div>
          <nav className="navbar navbar-expand-sm navbar-light bg-light">
            <Link className="navbar-brand" to="/">Hyperquery</Link>
            <ul className="navbar-nav">
              <li className="nav-item">
                <Link className="nav-link" to="/about">About</Link>
              </li>
            </ul>
          </nav>

          <Switch>
            <Route exact path="/" component={Home} />
            <Route exact path="/about" component={About} />
          </Switch>
        </div>
      </Router>
    );
  }
}

class Home extends Component {
  constructor(props) {
    super(props);

    let defaults = qs.parse(this.props.location.search, { ignoreQueryPrefix: true });

    let terms = [];
    if ("terms" in defaults) {
      terms = split(defaults["terms"], {
        separator: " ",
        quotes: [ "\"" ]
      }).filter(Boolean);
    }

    let selectedTheme = null;
    if ("theme" in defaults) {
      if (defaults["theme"] in data.themes) {
        selectedTheme = defaults["theme"];
      }
    }

    let selectedLanguages = {};
    for (let id in data.languages) {
      selectedLanguages[id] = true;
    }
    if ("languages" in defaults) {
      let defaultIds = defaults["languages"].split(",");
      for (let id in selectedLanguages) {
        if (defaultIds.indexOf(id) >= 0) {
          selectedLanguages[id] = true;
        } else {
          selectedLanguages[id] = false;
        }
      }
    }

    let selectedDatabase = data.databases ? Object.keys(data.databases)[0] : null;
    if ("database" in defaults) {
      if (defaults["database"] in data.databases) {
        selectedDatabase = defaults["database"];
      }
    }

    this.state = {
      terms: terms,
      translations: {},
      selectedTheme: selectedTheme,
      selectedLanguages: selectedLanguages,
      selectedDatabase: selectedDatabase,
      searchQuery: null,
      plainSearchQuery: null,
    };

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleTermsChange = this.handleTermsChange.bind(this);
    this.handleThemeChange = this.handleThemeChange.bind(this);
    this.handleLanguagesChange = this.handleLanguagesChange.bind(this);
    this.handleDatabaseChange = this.handleDatabaseChange.bind(this);
  }

  componentDidMount() {
    if (this.state.terms.length > 0) {
      this.updateTranslations();
    }
  }

  updateParams() {
    let languageIds = [];
    for (let id in data.languages) {
      if (this.state.selectedLanguages[id]) {
        languageIds.push(id);
      }
    }
    let path = "/?theme=" + (this.state.selectedTheme || "") + "&languages=" + languageIds.join(",") + "&database=" + (this.state.selectedDatabase || "") + "&terms=" + this.state.terms.join(" ");
    this.props.history.replace(path);
  }

  updateTranslations() {
    for (let i in this.state.terms) {
      let term = this.state.terms[i];
      if (!(term in this.state.translations)) {
        this.consultWiktionary(term, false);
      }
    }
  }

  consultWiktionary(term, separatePage) {
    let path = "https://en.wiktionary.org/w/api.php?origin=*&format=json&action=query&rvprop=content&prop=revisions&redirects=1&titles=" + encodeURIComponent(term.replace(/"/g, ""));
    if (separatePage) {
      path = path + "/translations";
    }
    fetch(path)
      .then(res => res.json())
      .then(
        (result) => {
          let translationsCopy = JSON.parse(JSON.stringify(this.state.translations));
          let termTranslations = translationsCopy[term] || {};
          if (!result || !result.query || !result.query.pages) {
            translationsCopy[term] = termTranslations;
            this.setState({
              translations: translationsCopy
            }, () => {
              this.updateSearchQuery();
            });
            return null;
          }
          for (let pageId in result.query.pages) {
            if (!result.query.pages[pageId].revisions) {
              continue;
            }
            let section = result.query.pages[pageId].revisions[0]["*"];
            for (let languageId in data.languages) {
              termTranslations[languageId] = [];
              let findTranslations = new RegExp("(?:{{t(?:\\+)?\\|" + languageId + "\\|)([^|{}\n]+)", "g");
              let foundTranslations;
              while ((foundTranslations = findTranslations.exec(section)) !== null) {
                if (foundTranslations.length > 0) {
                  for (let j = 0; j < foundTranslations.length; j++) {
                    if (foundTranslations[j] && foundTranslations[j].length > 0 && foundTranslations[j][0] !== "{") {
                      let cleanTranslation = foundTranslations[j].replace(/[[\]]/g, "");
                      if (cleanTranslation.split(" ").length > 1) {
                        cleanTranslation = "\"" + cleanTranslation + "\"";
                      }
                      if (termTranslations[languageId].indexOf(cleanTranslation) === -1) {
                        termTranslations[languageId].push(cleanTranslation);
                      }
                    }
                  }
                }
              }
            }
          }
          if (Object.values(termTranslations).some(e => e.length > 0)) {
            translationsCopy[term] = termTranslations;
            this.setState({
              translations: translationsCopy
            }, () => {
              this.updateSearchQuery();
            });
          } else {
            this.consultWiktionary(term, true);
          }
        },
        (error) => {
          console.log(error);
        }
      );
  }

  updateSearchQuery() {
    let queryParts = []
    for (let languageId in data.languages) {
      if (this.state.selectedLanguages[languageId]) {
        let dynamicTerms = [];
        let includeTerms = [];
        let excludeTerms = [];

        if (languageId === "en") {
          dynamicTerms = this.state.terms.map(e => [e]);
        } else {
          for (let i in this.state.terms) {
            let term = this.state.terms[i];
            if (this.state.translations[term] && this.state.translations[term][languageId] && this.state.translations[term][languageId].length > 0) {
              dynamicTerms.push(this.state.translations[term][languageId]);
            } else {
              dynamicTerms.push([term]);
            }
          }
        }

        if (this.state.selectedTheme) {
          includeTerms = [...data.languages[languageId]["terms"][this.state.selectedTheme]["include"]];
          excludeTerms = [...data.languages[languageId]["terms"][this.state.selectedTheme]["exclude"]];
        }

        let dynamicSubpart = null;
        if (dynamicTerms.length > 0) {
          dynamicSubpart = dynamicTerms.map((group) => {
            if (group.length > 1) {
              let groupPart = group.map(dynamicTerm =>
                <span key={[languageId, dynamicTerm]} className="dynamic">{dynamicTerm}</span>
              ).reduce((prev, curr) => [prev, " OR ", curr]);
              return <span key={[languageId, group]}>{"("}{groupPart}{")"}</span>;
            } else {
              return (
                <span key={[languageId, group]} className="dynamic">{group[0]}</span>
              );
            }
          }).reduce((prev, curr) => [prev, " AND ", curr]);
          if (dynamicTerms.length > 1) {
            dynamicSubpart = <span key={[languageId, dynamicTerms]}>{"("}{dynamicSubpart}{")"}</span>;
          }
        } else {
          continue;
        }

        let includeSubpart = null;
        if (includeTerms.length > 0) {
          includeSubpart = includeTerms.map((staticTerm) => (
            <span key={[languageId, staticTerm]} className="static">{staticTerm}</span>
          )).reduce((prev, curr) => [prev, " OR ", curr]);
          if (includeTerms.length > 1) {
            includeSubpart = <span key={[languageId, includeTerms]}>{"("}{includeSubpart}{")"}</span>;
          }
        }

        let excludeSubpart = null;
        if (excludeTerms.length > 0) {
          excludeSubpart = excludeTerms.map((staticTerm) => (
            <span key={[languageId, staticTerm]} className="static">{staticTerm}</span>
          )).reduce((prev, curr) => [prev, " OR ", curr]);
          if (excludeTerms.length > 1) {
            excludeSubpart = <span key={[languageId, excludeTerms]}>{"("}{excludeSubpart}{")"}</span>;
          }
        }

        let queryPart = null;
        if (includeSubpart) {
          if (excludeSubpart) {
            queryPart = (
              <span key={languageId}>
                {"("}{dynamicSubpart}{" AND "}{includeSubpart}{" AND NOT "}{excludeSubpart}{")"}
              </span>
            );
          } else {
            queryPart = (
              <span key={languageId}>
                {"("}{dynamicSubpart}{" AND "}{includeSubpart}{")"}
              </span>
            );
          }
        } else {
          queryPart = dynamicSubpart;
        }
        queryParts.push(queryPart);
      }
    }

    if (queryParts.length > 0) {
      let searchQuery = queryParts.reduce((prev, curr) => [prev, " OR ", curr]);
      this.setState({
        searchQuery: searchQuery,
        plainSearchQuery: innerText(searchQuery)
      });
    } else {
      this.setState({
        searchQuery: null,
        plainSearchQuery: null
      });
    }
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      if (this.state.plainSearchQuery && this.state.selectedDatabase) {
        let path = data.databases[this.state.selectedDatabase]["base_url"] + encodeURIComponent(this.state.plainSearchQuery);
        window.location.href = path;
      }
    }
  }

  handleTermsChange(event) {
    let terms = split(event.target.value, {
      separator: " ",
      quotes: [ "\"" ]
    }).filter(Boolean);
    this.setState({
      terms: terms
    }, () => {
      this.updateTranslations();
      this.updateSearchQuery();
      this.updateParams();
    });
  }

  handleThemeChange(event, id) {
    if (event.target.checked) {
      this.setState({
        selectedTheme: id
      }, () => {
        this.updateSearchQuery();
        this.updateParams();
      });
    }
  }

  handleLanguagesChange(isChecked, id) {
    let selectedLanguagesCopy = JSON.parse(JSON.stringify(this.state.selectedLanguages));
    selectedLanguagesCopy[id] = isChecked;
    this.setState({
      selectedLanguages: selectedLanguagesCopy
    }, () => {
      this.updateTranslations();
      this.updateSearchQuery();
      this.updateParams();
    });
  }

  handleDatabaseChange(selectedId) {
    this.setState({
      selectedDatabase: selectedId
    }, () => {
      this.updateParams();
    });
  }

  render() {
    return (
      <div className="container">
        <div className="row">
          <div className="col-md mt-3 mb-3">
            <div className="card">
              <div className="card-body">
                <div>
                  <div className="form-group">
                    <label htmlFor="terms-input">Search for works about</label>
                    <TermsInput onKeyDown={this.handleKeyDown} defaultValue={this.state.terms} onChange={this.handleTermsChange} />
                  </div>
                  <div className="form-group">
                    <label>that engage with</label><br />
                    <ThemeButtonsList themes={data.themes} defaultValue={this.state.selectedTheme} onChange={this.handleThemeChange}/>
                  </div>
                  <div className="form-group">
                    <label>themes in</label><br />
                    <LanguageCheckboxesList languages={data.languages} defaultValue={this.state.selectedLanguages} onChange={this.handleLanguagesChange}/>
                  </div>
                </div>
              </div>
              <div className="card-footer">
                <div className="form-inline">
                  <SearchButton plainSearchQuery={this.state.plainSearchQuery} selectedDatabase={this.state.selectedDatabase} />
                  <div className="input-group mb-1 mt-1">
                    <DatabaseSelector databases={data.databases} defaultValue={this.state.selectedDatabase} onChange={this.handleDatabaseChange}/>
                  </div>
                </div>
              </div>
            </div>
            <SaveDefaultsBar selectedTheme={this.state.selectedTheme} selectedLanguages={this.state.selectedLanguages} selectedDatabase={this.state.selectedDatabase} />
          </div>
          <div className="col-md mt-3 mb-3">
            <SearchQueryPanel searchQuery={this.state.searchQuery} />
            <div className="card">
              <div className="card-body">
                <p>Search across linguistic barriers for scholarly works that engage with counterhegemonic intellectual traditions.</p>
                <p>This tool composes a <em>hyperquery</em>, an augmented search query that uses <span className="query-preview">Boolean logic</span> to combine <span className="dynamic">automatic translations</span> of your search terms with <span className="static">curated terms</span> in each language.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class TermsInput extends Component {
  render() {
    return (
      <DebounceInput
        minLength={2}
        debounceTimeout={250}
        onChange={this.props.onChange}
        onKeyDown={this.props.onKeyDown}
        value={this.props.defaultValue.join(" ")}
        autoFocus={true}
        id="terms-input"
        type="text"
        className="form-control"
        placeholder="Type search terms, e.g., linguistics metaphor"
      />
    );
  }
}

class ThemeButton extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event) {
    this.props.onChange(event, this.props.id);
  }

  render() {
    const htmlId = "theme-button-" + this.props.id;
    return (
      <div className="custom-control custom-radio custom-control-inline">
        <input
          id={htmlId}
          onChange={this.handleChange}
          checked={this.props.defaultValue}
          name="theme-buttons"
          type="radio"
          className="custom-control-input"
        />
        <label
          htmlFor={htmlId}
          className="custom-control-label"
        >
          {this.props.name}
        </label>
      </div>
    );
  }
}

class ThemeButtonsList extends Component {
  render() {
    const buttons = [];
    for (let id in this.props.themes) {
      buttons.push(
        <ThemeButton
          key={id}
          id={id}
          name={this.props.themes[id]}
          defaultValue={this.props.defaultValue === id}
          onChange={this.props.onChange}
        />
      );
    }
    return buttons;
  }
}

class LanguageCheckbox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isChecked: this.props.defaultValue
    };
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event) {
    this.props.onChange(event.target.checked, this.props.id);
    this.setState({
      isChecked: event.target.checked
    });
  }

  render() {
    const htmlId = "language-checkbox-" + this.props.id;
    return (
      <div className="custom-control custom-checkbox custom-control-inline">
        <input
          id={htmlId}
          checked={this.state.isChecked}
          onChange={this.handleChange}
          type="checkbox"
          className="custom-control-input"
        />
        <label
          htmlFor={htmlId}
          className="custom-control-label"
        >
          {this.props.name}
        </label>
      </div>
    );
  }
}

class LanguageCheckboxesList extends Component {
  render() {
    const buttons = [];
    for (let id in this.props.languages) {
      buttons.push(
        <LanguageCheckbox
          key={id}
          id={id}
          name={this.props.languages[id]["name"]}
          englishName={this.props.languages[id]["name_en"]}
          defaultValue={this.props.defaultValue[id]}
          onChange={this.props.onChange}
        />
      );
    }
    return buttons;
  }
}

class DatabaseSelector extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedId: this.props.defaultValue
    };
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event) {
    this.props.onChange(event.target.value);
    this.setState({
      selectedId: event.target.value
    });
  }
  render() {
    const options = [];
    for (let id in this.props.databases) {
      options.push(
        <option
          key={id}
          value={id}
        >
          {this.props.databases[id]["name"]}
        </option>
      );
    }
    return (
      <select
        value={this.state.selectedId}
        onChange={this.handleChange}
        className="form-control"
      >
        {options}
      </select>
    );
  }
}

class SearchButton extends Component {
  render() {
    if (this.props.plainSearchQuery) {
      let path = data.databases[this.props.selectedDatabase]["base_url"] + encodeURIComponent(this.props.plainSearchQuery);
      return (
        <a href={path}>
          <button className="btn btn-success mr-3 mb-1 mt-1">Search</button>
        </a>
      );
    } else {
      return <button type="button" disabled={true} className="btn btn-secondary disabled mr-3 mb-1 mt-1">Search</button>;
    }
  }
}

class SaveDefaultsBar extends Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
  }

  handleChange(event) {
    return null;
  }

  render() {
    let languageIds = [];
    for (let id in data.languages) {
      if (this.props.selectedLanguages[id]) {
        languageIds.push(id);
      }
    }
    let path = process.env.PUBLIC_URL + "/?theme=" + (this.props.selectedTheme || "") + "&languages=" + languageIds.join(",") + "&database=" + (this.props.selectedDatabase || "");
    return (
      <div className="input-group input-group-sm mt-3">
        <div className="input-group-prepend">
          <span className="input-group-text">Save defaults</span>
        </div>
        <input
          value={path}
          onChange={this.handleChange}
          type="text"
          className="form-control text-monospace"
        />
      </div>
    );
  }
}

class SearchQueryPanel extends Component {
  render() {
    if (this.props.searchQuery) {
      return (
        <div className="card mb-3">
          <div className="card-body">
            <code className="query-preview">
              <div>{this.props.searchQuery}</div>
            </code>
          </div>
        </div>
      );
    } else {
      return null;
    }
  }
}

function About() {
  return (
    <div className="container">
      <div className="row">
        <div className="col-md-6 mt-3 mb-3">
          <h2>About</h2>
          <p><Link to="/">Hyperquery</Link> is an experimental search tool for academic literature. Its purpose is to facilitate searching across linguistic barriers for scholarly works that engage with counterhegemonic intellectual traditions.</p>
          <p>We welcome questions and suggestions, as well as contributions of curated terms in any language. Contact us at <a href="mailto:hyperquery@mit.edu">hyperquery@mit.edu</a>.</p>
          <h4>How it works</h4>
          <ul>
            <li>Search terms are case sensitive. For example, the tool finds translations for <code className="dynamic">biology</code> but not for <code className="dynamic">Biology</code>, and for <code className="dynamic">Soviet</code> but not for <code className="dynamic">soviet</code>.</li>
            <li>Search terms should be separated by spaces, for example <code className="dynamic">modernism architecture utopia</code>.</li>
            <li>A search term may consist of multiple words inside quotes, for example <code className="dynamic">"Turing machine"</code>.</li>
            <li>Automatic translations are provided by <a href="https://www.wiktionary.org/">Wiktionary</a>.</li>
            <li>At this time, search terms should be in English for automatic translations to appear. We intend to support more languages in the future, but non-English editions of Wiktionary have significantly less translations available.</li>
            <li>The tool supports both the inclusion and the exclusion of curated terms. For example, the tool may search for works that include the term <code className="static">"critical race"</code> but that exclude <code className="static">"race relations"</code>, since the latter tends to pick out outdated literature (note the operator <code className="query-preview">NOT</code>).</li>
            <li>For a primer on Boolean operators (<code className="query-preview">AND</code>, <code className="query-preview">OR</code>, <code className="query-preview">NOT</code>), see this <a href="https://libguides.mit.edu/c.php?g=175963&p=1158594">guide</a> from the MIT Libraries.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
