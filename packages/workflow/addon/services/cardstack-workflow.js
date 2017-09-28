import Service from "@ember/service"
import { task } from 'ember-concurrency';
import { inject } from "@ember/service";
import { computed } from "@ember/object";
import { readOnly, filterBy, or } from "@ember/object/computed";

function threadsBetween(arrayKey, dateKey, { from, to }) {
  return computed(`${arrayKey}.@each.${dateKey}`, function() {
    return this.get(arrayKey).filter((item) => {
      let date = moment(item.get(dateKey));
      if (from && to) {
        return date >= from && date <= to;
      }
      if (to) {
        return date <= to;
      }
      if (from) {
        return date >= from;
      }
    });
  });
}

export default Service.extend({
  isOpen: false,
  selectedThread: null,
  selectedTag: null,
  selectedDate: null,
  selectedPriority: '',

  store: inject(),

  loadItems: task(function * () {
    let threads = yield this.get('store').findAll('thread');
    this.set('items', threads);
  }).restartable().on('init'),

  init() {
    this._super();
    this.items = [];
  },

  unhandledItems:           filterBy('items', 'isUnhandled'),
  notificationCount:        readOnly('unhandledItems.length'),
  unhandledForToday:        filterBy('threadsUpdatedToday', 'isUnhandled'),
  todaysNotificationCount:  readOnly('unhandledForToday.length'),

  groupedThreads: computed('items.@each.{priority,loadedTags,isUnhandled}', function() {
    return this.get('items').reduce((groupedThreads, thread) => {
      let priority = thread.get('priority');
      let priorityId = priority.get('id');
      if (!groupedThreads[priorityId]) {
        groupedThreads[priorityId] = {
          name: priority.get('name'),
          tagGroups: {}
        };
      }

      let threadsForPriority = groupedThreads[priorityId];
      let tags = thread.get('loadedTags');
      for (let i=0; i<tags.length; i++) {
        let tag = tags.objectAt(i);
        let tagId = tag.get('id');
        if (!threadsForPriority.tagGroups[tagId]) {
          threadsForPriority.tagGroups[tagId] = {
            name: tag.get('name'),
            priorityLevel: thread.get('priorityLevel'),
            all: [],
            unhandled: [],
          }
        }
        let threadsForTag = threadsForPriority.tagGroups[tagId];
        threadsForTag.all.push(thread);
        if (thread.get('isUnhandled')) {
          threadsForTag.unhandled.push(thread);
        }
      }
      return groupedThreads;
    }, {});
  }),

  threadsUpdatedToday: threadsBetween('items', 'updatedAt', {
    from: moment().subtract(1, 'day')
  }),

  selectedTag:    '',
  threadsWithSelectedTag: computed('items.@each.{loadedTagIds,priority}', 'selectedTag', function() {
    let selectedTagId = this.get('selectedTag.id');
    let withSelectedTag = this.get('items').filter((thread) => thread.get('loadedTagIds').includes(selectedTagId));
    return withSelectedTag.reduce((groups, thread) => {
      let priority = thread.get('priority');
      let priorityId = priority.get('id');
      if (!groups[priorityId]) {
        groups[priorityId] = {
          name: priority.get('name'),
          threads: []
        }
      }

      groups[priorityId].threads.push(thread);
      return groups;
    }, {});
  }),

  selectedDate: '',
  threadsWithSelectedDate: computed('selectedDate', function() {
    if (this.get('selectedDate') === 'today') {
      let threads = this.get('threadsUpdatedToday');
      return {
        today: {
          name: 'Today',
          threads
        }
      };
    }
    return {};
  }),

  shouldShowMatchingThreads: or('selectedTag', 'selectedDate'),

  matchingThreads: computed('selectedTag', 'selectedDate', 'threadsWithSelectedTag', 'threadsWithSelectedDate', function() {
    if (this.get('selectedTag')) {
      return this.get('threadsWithSelectedTag');
    }
    if (this.get('selectedDate')) {
      return this.get('threadsWithSelectedDate');
    }
    return [];
  }),

  process(message) {
    message.handle();
  },

  createMessage({ thread, text }) {
    let chatMessage = this.get('store').createRecord('chat-message', {
      text
    });
    let message = this.get('store').createRecord('message', {
      sentAt: moment(),
      status: 'unhandled'
    });
    return chatMessage.save()
      .then((chatMessage) => {
        message.setProperties({
          cardId: chatMessage.get('id'),
          cardType: 'chat-messages'
        });
        return message.save();
      })
      .then((message) => {
        thread.addMessage(message);
      })
      .catch((error) => {
        console.error("Something went wrong", error);
      });
  },

  selectDate(date) {
    this.setProperties({
      selectedDate: date,
      selectedTag: null
    });
    this.clearSelectedThread();
  },

  selectTag({ priority, tagId }) {
    this.set('selectedPriority', priority);
    let selectedTag = this.get('store').peekRecord('tag', tagId);
    this.setProperties({
      selectedDate: null,
      selectedTag
    });
    this.clearSelectedThread();
  },

  selectThread(thread) {
    this.set('selectedThread', thread);
  },

  clearGroupSelection() {
    this.setProperties({
      selectedDate: null,
      selectedTag: null
    });
  },

  clearSelectedThread() {
    this.set('selectedThread', null);
  }
});
