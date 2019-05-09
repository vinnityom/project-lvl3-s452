import validator from 'validator';
import { watch } from 'melanke-watchjs';
import axios from 'axios';
import _ from 'lodash';
import * as utils from './utils';

export default () => {
  const state = {
    inputStatus: 'init',
    channels: {},
    feedLinks: [],
    alert: null,
    previousActiveModal: null,
    currentActiveModal: null,
    renderType: null,
  };

  const input = document.querySelector('input');
  const button = document.getElementById('searchButton');
  const renderedItems = {};

  const getFeed = (link, loadingType) => {
    const methods = {
      channelInit: {
        proccessData: (items, name, description) => {
          const feedItems = utils.processFeedItems(items);
          state.channels = { ...state.channels, [name]: { feedItems, description } };
        },
        proccessState: () => {
          state.inputStatus = 'init';
          state.alert = null;
          state.feedLinks.push(link);
        },
        proccessRenderigHistory: (name) => {
          renderedItems[name] = [];
        },
      },
      channelUpdate: {
        proccessData: (items, name) => {
          const newFeedItems = items.filter((item) => {
            const title = item.querySelector('title').textContent;
            const oldItems = state.channels[name].feedItems;
            const newItem = _.find(oldItems, i => title === i.title);
            return !newItem;
          });
          const proccessedItems = utils.processFeedItems(newFeedItems);
          state.channels[name].feedItems = [...state.channels[name].feedItems, ...proccessedItems];
        },
        proccessState: () => {},
        proccessRenderigHistory: () => {},
      },
    };

    axios(`https://cors-anywhere.herokuapp.com/${link}`)
      .then((response) => {
        const feed = utils.parse(response.data);
        if (!feed) {
          state.alert = 'notRSS';
          return;
        }
        const {
          proccessState, proccessData, proccessRenderigHistory,
        } = methods[loadingType];
        const channelName = feed.querySelector('channel > title').textContent;
        proccessState();

        const description = feed.querySelector('description');
        const feedItems = [...feed.querySelectorAll('item')];

        proccessData(feedItems, channelName, description);
        proccessRenderigHistory(channelName);
        state.renderType = loadingType;
      })
      .then(() => setTimeout(() => getFeed(link, 'channelUpdate'), 5000));
  };

  input.addEventListener('input', ({ target: { value } }) => {
    const statusDispatch = [
      {
        check: inputValue => inputValue === '',
        currentStatus: 'init',
      },
      {
        check: inputValue => validator.isURL(inputValue),
        currentStatus: 'urlValid',
      },
      {
        check: inputValue => !validator.isURL(inputValue),
        currentStatus: 'urlInvalid',
      },
    ];

    state.inputStatus = _.find(statusDispatch, element => element.check(value)).currentStatus;
  });

  button.addEventListener('click', () => {
    if (state.inputStatus !== 'urlValid') {
      return;
    }

    const currentURL = input.value;
    if (state.feedLinks.includes(currentURL)) {
      state.alert = 'URLDouble';
      return;
    }
    state.inputStatus = 'loading';
    state.alert = 'loading';

    getFeed(currentURL, 'channelInit');
  });

  watch(state, 'inputStatus', () => utils.processInput(state.inputStatus)(input, button));

  watch(state, 'alert', () => {
    const currentAlert = document.getElementById('alert');

    if (currentAlert) {
      currentAlert.remove();
    }

    if (!state.alert) {
      return;
    }

    const types = {
      URLDouble: {
        message: 'Seems like you already have chis channel',
        className: 'alert-danger',
      },
      loading: {
        message: 'Loading RSS-feed',
        className: 'alert-success',
      },
      notRSS: {
        message: 'Sorry, but this url is not RSS',
        className: 'alert-danger',
      },
    };

    const alert = utils.makeAlert(types[state.alert]);
    const alertCol = document.createElement('div');
    alertCol.classList.add('col');
    alertCol.append(alert);

    const alertRow = document.createElement('div');
    alertRow.append(alertCol);
    alertRow.classList.add('row', 'justify-content-center');
    alertRow.id = 'alert';
    document.getElementById('search-row').after(alertRow);
  });

  watch(state, 'channels', () => {
    const feedUl = document.getElementById('feed') || utils.createFeedUl();

    const methods = {
      channelInit: {
        getChannel: (channelName, feed) => {
          if (document.getElementById(channelName)) {
            return null;
          }
          const channel = utils.createChannel(channelName, feed);
          feedUl.prepend(channel);
          return channel;
        },
        getFeedList: (channelName) => {
          const feedList = document.createElement('ul');
          feedList.classList.add('list-group');
          document.getElementById(channelName).append(feedList);
          return feedList;
        },
        insert: (parent, child) => parent.append(child),
        updateInput: () => {
          input.value = '';
        },
      },
      channelUpdate: {
        getChannel: channelName => document.getElementById(channelName),
        getFeedList: channelName => document.getElementById(channelName).querySelector('ul'),
        insert: (parent, child) => parent.prepend(child),
        updateInput: () => {},
      },
    };
    const {
      getChannel, getFeedList, insert, updateInput,
    } = methods[state.renderType];

    updateInput();

    _.keys(state.channels).forEach((channelName) => {
      const feed = state.channels[channelName];
      getChannel(channelName, feed);

      const feedList = getFeedList(channelName);

      feed.feedItems.forEach(({ title, link, itemDescription }) => {
        if (renderedItems[channelName].includes(title)) {
          return;
        }
        renderedItems[channelName].push(title);
        const aEl = document.createElement('a');
        aEl.href = link;
        aEl.append(document.createTextNode(title));
        const aCol = document.createElement('div');
        aCol.classList.add('col');
        aCol.append(aEl);

        const modal = utils.createModalElement(title, itemDescription);
        modal.querySelector('.close').addEventListener('click', () => {
          state.previousActiveModal = state.currentActiveModal;
          state.currentActiveModal = null;
        });

        const descriptionButton = utils.createDescriptionButton(title, state);
        descriptionButton.addEventListener('click', ({ target }) => {
          state.currentActiveModal = target.dataset.target;
        });

        const descriptionButtonCol = document.createElement('div');
        descriptionButtonCol.classList.add('col-sm-2');
        descriptionButtonCol.append(descriptionButton);

        const row = document.createElement('div');
        row.classList.add('row', 'container-fluid');
        row.append(aCol);
        row.append(descriptionButtonCol);
        const li = document.createElement('li');
        li.classList.add('list-group-item');
        li.append(row);
        li.append(modal);
        li.id = title;
        insert(feedList, li);
      });
    });
  });

  watch(state, 'currentActiveModal', () => {
    if (!state.currentActiveModal) {
      const modalToClose = document.getElementById(state.previousActiveModal.slice(1));
      modalToClose.classList.remove('show');
      modalToClose.setAttribute('aria-hidden', 'true');
      modalToClose.removeAttribute('style');

      document.querySelector('.modal-backdrop').remove();
      document.body.classList.remove('modal-open');
      return;
    }

    const modalToShow = document.getElementById(state.currentActiveModal.slice(1));
    modalToShow.classList.add('show');
    modalToShow.removeAttribute('aria-hidden');
    modalToShow.setAttribute('style', 'display: block');

    const modalBackdrop = document.createElement('div');
    modalBackdrop.classList.add('modal-backdrop', 'fade', 'show');

    document.body.classList.add('modal-open');
    document.body.append(modalBackdrop);
  });
};
